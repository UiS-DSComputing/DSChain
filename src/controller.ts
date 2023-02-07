/*
 * SPDX-License-Identifier: Apache-2.0
 */
// Deterministic JSON.stringify()
import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from "fabric-contract-api";
import stringify from "json-stringify-deterministic";
import sortKeysRecursive from "sort-keys-recursive";
import { Org } from "./model";

// Access
const WRITE = 0x001;
const READ = 0x010;
const DELETE = 0x100;

const orgPrefix = "org";
const userPrefix = "user";
const ALL_ORG_KEY = "org-all";
const ADMIN_ORG_KEY = "org-admin";
const INIT_KEY = "init";

@Info({
  title: "UisController",
  description: "",
})
export class UisControllerContract extends Contract {
  @Transaction()
  public async Init(ctx: Context): Promise<void> {
    const isInitialized = await ctx.stub.getState(INIT_KEY);
    console.info(
      `Init: ${isInitialized.toString()}, typeof: ${typeof isInitialized.toString()}`
    );
    if (isInitialized.toString() !== "") {
      throw new Error(`Init is already invoked: ${isInitialized}`);
    }

    const org = {
      id: ctx.clientIdentity.getMSPID(),
      access: WRITE | READ | DELETE,
      users: [ctx.clientIdentity.getID()],
    };

    const orgKey = this.GetOrgKey(ctx, org.id);
    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );
    console.info(`Org ${JSON.stringify(org)} initialized`);

    await ctx.stub.putState(ALL_ORG_KEY, Buffer.from(stringify([org.id])));
    await ctx.stub.putState(ADMIN_ORG_KEY, Buffer.from(stringify([org.id])));
    await ctx.stub.putState(INIT_KEY, Buffer.from("initialized"));
  }
  GetOrgKey(ctx: Context, orgId: string): string {
    return ctx.stub.createCompositeKey(orgPrefix, [orgId]);
  }
  GetUserKey(ctx: Context, userId: string): string {
    return ctx.stub.createCompositeKey(userPrefix, [userId]);
  }
  @Transaction()
  async AddOrg(ctx: Context, orgId: string, access: number): Promise<void> {
    const isAdmin = await this.IsAdmin(ctx);
    if (!isAdmin) {
      throw new Error(`Only admin can execute this function`);
    }
    const orgKey = this.GetOrgKey(ctx, orgId);
    const exists = await this.OrgExists(ctx, orgKey);
    if (exists) {
      throw new Error(`The Org ${orgId} exists`);
    }

    const org = {
      id: orgId,
      access: access,
      users: [],
    };
    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );

    // Update `orgIds`
    const orgIds = await this.GetContentByKey(ctx, ALL_ORG_KEY);
    orgIds.push(org.id);
    await ctx.stub.putState(ALL_ORG_KEY, Buffer.from(stringify(orgIds)));
  }

  @Transaction()
  async RemoveOrg(ctx: Context, orgId: string): Promise<void> {
    const isAdmin = await this.IsAdmin(ctx);
    if (!isAdmin) {
      throw new Error(`Only admin can execute this function`);
    }
    const orgKey = this.GetOrgKey(ctx, orgId);
    const exists = await this.OrgExists(ctx, orgKey);
    if (!exists) {
      throw new Error(`The Org ${orgId} does not exists`);
    }
    const orgIds = await this.GetContentByKey(ctx, ALL_ORG_KEY);
    const index = orgIds.indexOf(orgId);
    orgIds.splice(index, 1);
    await ctx.stub.putState(ALL_ORG_KEY, Buffer.from(stringify(orgIds)));

    return ctx.stub.deleteState(orgKey);
  }

  @Transaction(false)
  @Returns("string")
  async ReadAllOrgKeys(ctx: Context): Promise<string> {
    const _orgIds = await ctx.stub.getState(ALL_ORG_KEY);
    return _orgIds.toString();
  }

  @Transaction(false)
  async IsAdmin(ctx: Context): Promise<boolean> {
    const ADMINS = await this.GetContentByKey(ctx, ADMIN_ORG_KEY);
    if (ADMINS.includes(ctx.clientIdentity.getMSPID())) {
      return true;
    }
    return false;
  }
  @Transaction(false)
  async IsOrgOwner(ctx: Context): Promise<boolean> {
    return true;
  }
  @Transaction(false)
  @Returns("string")
  public async ReadOrg(ctx: Context, orgId: string): Promise<string> {
    const orgKey = this.GetOrgKey(ctx, orgId);
    const orgJSON = await ctx.stub.getState(orgKey);
    if (!orgJSON || orgJSON.length === 0) {
      throw new Error(`The org ${orgId} does not exist`);
    }
    return orgJSON.toString();
  }
  @Transaction(false)
  public async ReadAllOrgs(ctx: Context): Promise<Array<string>> {
    const orgIds = await this.GetContentByKey(ctx, ALL_ORG_KEY);
    console.info(`ReadAllOrgs: `, orgIds);
    const orgs = [];
    for (const orgId of orgIds) {
      const org = await this.ReadOrg(ctx, orgId);
      orgs.push(org);
    }
    return orgs;
  }
  @Transaction(false)
  @Returns("boolean")
  public async OrgExists(ctx: Context, id: string): Promise<boolean> {
    const orgJSON = await ctx.stub.getState(id);
    console.info("orgJSON: ", orgJSON.toString());
    return orgJSON && orgJSON.length > 0;
  }
  async GetContentByKey(ctx: Context, key: string): Promise<any> {
    const _content = await ctx.stub.getState(key);
    const content = JSON.parse(_content.toString());
    return content;
  }

  @Transaction(false)
  @Returns("number")
  public async CheckOrgAccess(ctx: Context, orgId: string): Promise<number> {
    const orgKey = this.GetOrgKey(ctx, orgId);
    const org = await this.GetContentByKey(ctx, orgKey);
    return org.access;
  }
  @Transaction()
  public async UpdateOrgAccess(
    ctx: Context,
    orgId: string,
    access: number
  ): Promise<void> {
    const orgKey = this.GetOrgKey(ctx, orgId);
    const exists = await this.OrgExists(ctx, orgKey);
    if (!exists) {
      throw new Error(`The Org ${orgId} does not exists`);
    }
    const org = await this.GetContentByKey(ctx, orgKey);
    org.access = access;
    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );
  }

  @Transaction()
  async AddUser(ctx: Context, userId: string, access: number): Promise<void> {
    const orgId = ctx.clientIdentity.getMSPID();
    const orgKey = this.GetOrgKey(ctx, orgId);
    const exists = await this.OrgExists(ctx, orgKey);
    if (!exists) {
      throw new Error(`The Org ${orgId} does not exists`);
    }
    const org = await this.GetContentByKey(ctx, orgKey);
    org.users.push(ctx.clientIdentity.getID());
    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );
  }

  @Transaction()
  async RemoveUser(ctx: Context, userId: string): Promise<void> {
    const orgId = ctx.clientIdentity.getMSPID();
    const orgKey = this.GetOrgKey(ctx, orgId);
    const exists = await this.OrgExists(ctx, orgKey);
    if (!exists) {
      throw new Error(`The Org ${orgId} does not exists`);
    }
    const org = await this.GetContentByKey(ctx, orgKey);
    const index = org.users.indexOf(userId);
    if (index >= 0) {
      org.users.splice(index, 1);
      await ctx.stub.putState(
        orgKey,
        Buffer.from(stringify(sortKeysRecursive(org)))
      );
    }
  }
  @Transaction(false)
  @Returns("number")
  async CheckUserAccess(
    ctx: Context,
    orgId: string,
    userId: string
  ): Promise<number> {
    const orgKey = this.GetOrgKey(ctx, orgId);
    const org = await this.GetContentByKey(ctx, orgKey);
    const index = org.users.indexOf(userId);
    if (index >= 0) {
      return org.access;
    }
    // No Permission
    return 0;
  }
}
