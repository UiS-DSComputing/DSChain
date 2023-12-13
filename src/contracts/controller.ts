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
import { Org, User } from "./model";
import * as Constants from "./constants";

// const orgPrefix = "org";
// const userPrefix = "user";
// const ALL_ORG_KEY = "org-all";
// const ADMIN_ORG_KEY = "org-admin";
// const INIT_KEY = "init";

@Info({
  title: "UisController",
  description: "",
})
export class UisControllerContract extends Contract {
  constructor() {
    super("UisControllerContract");
  }

  /**
   * Initialize the contract
   */
  @Transaction()
  public async init(ctx: Context): Promise<void> {
    const isInitialized = await ctx.stub.getState(
      Constants.KEYS.IS_INITIALIZED
    );
    if (isInitialized.toString() !== "") {
      throw new Error("Initialized");
    }
    await ctx.stub.putState(
      Constants.KEYS.OWNER,
      Buffer.from(ctx.clientIdentity.getID())
    );
    await ctx.stub.putState(Constants.KEYS.IS_INITIALIZED, Constants.TRUE);
  }

  // @Transaction()
  // public async transferOwnershipTo(
  //   ctx: Context,
  //   clientId: string
  // ): Promise<void> {
  //   await this.onlyOwner(ctx);
  //   await ctx.stub.putState(Constants.KEYS.OWNER, Buffer.from(clientId));
  // }

  async onlyOwner(ctx: Context) {
    const owner = await ctx.stub.getState(Constants.KEYS.OWNER);
    if (owner.toString() !== ctx.clientIdentity.getID()) {
      throw new Error("Ownership: no permission");
    }
  }

  @Transaction(false)
  @Returns("string")
  async owner(ctx: Context): Promise<string> {
    const owner = await ctx.stub.getState(Constants.KEYS.OWNER);
    return owner.toString();
  }

  getOrgKey(ctx: Context, id: string): string {
    return ctx.stub.createCompositeKey(Constants.KEYS.ORG_KEY_PREFIX, [id]);
  }
  getUserKey(ctx: Context, id: string): string {
    return ctx.stub.createCompositeKey(Constants.KEYS.USER_KEY_PREFIX, [id]);
  }

  @Transaction()
  public async addOrg(
    ctx: Context,
    id: string,
    name: string,
    access: number
  ): Promise<void> {
    await this.onlyOwner(ctx);

    const orgKey = this.getOrgKey(ctx, id);
    await this.getObjectByKey(ctx, orgKey);

    // Throw error if exists
    throw new Error(`Org ${id} exists`);

    const org = {
      id,
      name,
      access,
      users: {},
      pubs: {},
      subs: {},
      datasets: {},
    } as Org;

    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );
  }

  @Transaction()
  public async updateOrgName(
    ctx: Context,
    id: string,
    name: string
  ): Promise<void> {
    await this.onlyOwner(ctx);
    const orgKey = this.getOrgKey(ctx, id);

    const org = (await this.getObjectByKey(ctx, orgKey)) as Org;
    org.name = name;
    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );
  }

  @Transaction()
  public async updateOrgAccess(
    ctx: Context,
    id: string,
    access: number
  ): Promise<void> {
    await this.onlyOwner(ctx);
    const orgKey = this.getOrgKey(ctx, id);

    const org = (await this.getObjectByKey(ctx, orgKey)) as Org;
    org.access = access;
    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );
  }

  @Transaction()
  public async updateOrgDatasetAccess(
    ctx: Context,
    id: string,
    dataset: string,
    access: number
  ): Promise<void> {
    await this.onlyOwner(ctx);
    const orgKey = this.getOrgKey(ctx, id);
    const org = (await this.getObjectByKey(ctx, orgKey)) as Org;
    // Need consider permission inversion
    org.datasets[dataset] = access;

    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );
  }

  @Transaction()
  public async removeOrg(ctx: Context, id: string): Promise<void> {
    await this.onlyOwner(ctx);
    const orgKey = this.getOrgKey(ctx, id);
    await ctx.stub.deleteState(orgKey);
  }

  @Transaction(false)
  @Returns("string")
  public async getOrg(ctx: Context, id: string): Promise<string> {
    const orgKey = this.getOrgKey(ctx, id);
    const org = await ctx.stub.getState(orgKey);
    return org.toString();
  }

  async getObjectByKey(
    ctx: Context,
    key: string
  ): Promise<{ [key: string]: any }> {
    const _content = (await ctx.stub.getState(key)).toString();
    if (_content === "") {
      throw new Error(`Key ${key} has no corresponding content`);
    }
    const content = JSON.parse(_content);
    return content;
  }

  @Transaction()
  public async addUser(
    ctx: Context,
    id: string,
    name: string,
    email: string,
    phone: string
  ): Promise<void> {
    // Add user to org
    const orgId = ctx.clientIdentity.getMSPID();
    const orgKey = this.getOrgKey(ctx, orgId);
    const org = await this.getObjectByKey(ctx, orgKey);
    org.users[id] = true;
    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );
    // Assign user's info
    const userKey = this.getUserKey(ctx, id);
    let user: User;
    try {
      const user = (await this.getObjectByKey(ctx, userKey)) as User;
      user.name = name;
      user.email = email;
      user.phone = phone;
      user.orgs[orgId] = true;
    } catch (e) {
      user = { id, name, email, phone, orgs: { orgId: true } } as User;
    }

    await ctx.stub.putState(
      userKey,
      Buffer.from(stringify(sortKeysRecursive(user)))
    );
  }

  @Transaction()
  public async removeUser(ctx: Context, id: string): Promise<void> {
    // Remove user from org
    const orgId = ctx.clientIdentity.getMSPID();
    const orgKey = this.getOrgKey(ctx, orgId);
    const org = await this.getObjectByKey(ctx, orgKey);
    if (org.users[id]) {
      org.users[id] = false;
      await ctx.stub.putState(
        orgKey,
        Buffer.from(stringify(sortKeysRecursive(org)))
      );

      const userKey = this.getUserKey(ctx, id);
      try {
        const user = (await this.getObjectByKey(ctx, userKey)) as User;
        user.orgs[orgId] = false;
      } catch (e) {}
    }
  }

  @Transaction(false)
  @Returns("string")
  public async getUsers(ctx: Context, orgId: string): Promise<string> {
    // if (ctx.clientIdentity.getMSPID() !== orgId) {
    //   throw new Error("Only Org can view");
    // }
    const orgKey = this.getOrgKey(ctx, orgId);
    const org = await this.getObjectByKey(ctx, orgKey);
    const users = [];
    for (const userId of org.users) {
      const userKey = this.getUserKey(ctx, userId);
      const user = await this.getObjectByKey(ctx, userKey);
      if (user.orgs[orgId]) {
        users.push(user);
      }
    }
    return JSON.stringify(users);
  }

  @Transaction(false)
  @Returns("string")
  public async getUser(
    ctx: Context,
    orgId: string,
    userId: string
  ): Promise<string> {
    // if (ctx.clientIdentity.getMSPID() !== orgId) {
    //   throw new Error("Only Org can view");
    // }
    const userKey = this.getUserKey(ctx, userId);
    const user = await this.getObjectByKey(ctx, userKey);
    return JSON.stringify(user);
  }

  @Transaction()
  public async publishDatasetTo(
    ctx: Context,
    dataset: string,
    channel: string,
    access: number
  ): Promise<void> {
    const orgId = ctx.clientIdentity.getMSPID();
    const orgKey = this.getOrgKey(ctx, orgId);
    const org = await this.getObjectByKey(ctx, orgKey);

    org.pubs[channel] = true;

    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );

    // ////////////////////////////////////////////////////////////////////////////////
    // let datasetToChannels = {};
    // try {
    //   datasetToChannels = await this.getObjectByKey(
    //     ctx,
    //     Constants.KEYS.DATASET_TO_CHANNELS
    //   );
    //   datasetToChannels[dataset].push(channel);
    // } catch (e) {
    //   datasetToChannels[dataset] = [channel];
    // }

    // await ctx.stub.putState(
    //   Constants.KEYS.DATASET_TO_CHANNELS,
    //   Buffer.from(stringify(sortKeysRecursive(datasetToChannels)))
    // );

    // ////////////////////////////////////////////////////////////////////////////////
    let channelToPubs = {};
    try {
      channelToPubs = await this.getObjectByKey(
        ctx,
        Constants.KEYS.CHANNEL_TO_PUBS
      );
      channelToPubs[channel].push(orgId);
    } catch (e) {
      channelToPubs[channel] = [orgId];
    }

    await ctx.stub.putState(
      Constants.KEYS.CHANNEL_TO_PUBS,
      Buffer.from(stringify(sortKeysRecursive(channelToPubs)))
    );
  }

  @Transaction()
  public async revokePublishedDataset(
    ctx: Context,
    dataset: string,
    channel: string,
    access
  ) {
    // TODO:
  }

  @Transaction()
  public async subscribe(ctx: Context, channel: string): Promise<void> {
    const orgId = ctx.clientIdentity.getMSPID();
    const orgKey = this.getOrgKey(ctx, orgId);
    const org = await this.getObjectByKey(ctx, orgKey);

    org.subs[channel] = true;
    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );

    ////////////////////////////////////////////////////////////////////////////////
    // let channelToSubs = {};
    // try {
    //   channelToSubs = await this.getObjectByKey(
    //     ctx,
    //     Constants.KEYS.CHANNEL_TO_PUBS
    //   );
    //   channelToSubs[channel].push(orgId);
    // } catch (e) {
    //   channelToSubs[channel] = [orgId];
    // }

    // await ctx.stub.putState(
    //   Constants.KEYS.CHANNEL_TO_SUBS,
    //   Buffer.from(stringify(sortKeysRecursive(channelToSubs)))
    // );
  }

  @Transaction()
  public async revokeSubscribing(ctx: Context, channel: string): Promise<void> {
    const orgId = ctx.clientIdentity.getMSPID();
    const orgKey = this.getOrgKey(ctx, orgId);
    const org = await this.getObjectByKey(ctx, orgKey);

    org.subs[channel] = false;
    await ctx.stub.putState(
      orgKey,
      Buffer.from(stringify(sortKeysRecursive(org)))
    );
  }

  @Transaction(false)
  @Returns("number")
  public async queryAccessOnDataset(
    ctx: Context,
    userId: string,
    dataset: string
  ): Promise<number> {
    // If no publishers, it's safe to throw error
    const channelToPubs = await this.getObjectByKey(
      ctx,
      Constants.KEYS.CHANNEL_TO_PUBS
    );

    const userKey = this.getUserKey(ctx, userId);
    // If no user, it's safe to throw error
    const user = await this.getObjectByKey(ctx, userKey);

    for (const orgId of user.orgs) {
      const orgKey = this.getOrgKey(ctx, orgId);
      // Never throw error
      const org = await this.getObjectByKey(ctx, orgKey);

      for (const channel of Object.keys(org.subs)) {
        const pubs = channelToPubs[channel];
        for (const pubId of pubs) {
          const pubKey = this.getOrgKey(ctx, pubId);
          // Never throw error
          const pub = await this.getObjectByKey(ctx, pubKey);
          const datasets = Object.keys(pub.datasets);
          if (datasets.includes(dataset)) {
            return pub.datasets[dataset].access;
          }
        }
      }
    }
    return 0x000;
  }

  // @Transaction()
  // async AddOrg(ctx: Context, orgId: string, access: number): Promise<void> {
  //   const isAdmin = await this.IsAdmin(ctx);
  //   if (!isAdmin) {
  //     throw new Error(`}Only admin can execute this function`);
  //   }
  //   const orgKey = this.GetOrgKey(ctx, orgId);
  //   const exists = await this.OrgExists(ctx, orgKey);
  //   if (exists) {
  //     throw new Error(`The Org ${orgId} exists`);
  //   }

  //   const org = {
  //     id: orgId,
  //     access: access,
  //     users: [],
  //   };
  //   await ctx.stub.putState(
  //     orgKey,
  //     Buffer.from(stringify(sortKeysRecursive(org)))
  //   );

  //   // Update `orgIds`
  //   const orgIds = await this.GetContentByKey(ctx, ALL_ORG_KEY);
  //   orgIds.push(org.id);
  //   await ctx.stub.putState(ALL_ORG_KEY, Buffer.from(stringify(orgIds)));
  // }

  // @Transaction()
  // async RemoveOrg(ctx: Context, orgId: string): Promise<void> {
  //   const isAdmin = await this.IsAdmin(ctx);
  //   if (!isAdmin) {
  //     throw new Error(`Only admin can execute this function`);
  //   }
  //   const orgKey = this.GetOrgKey(ctx, orgId);
  //   const exists = await this.OrgExists(ctx, orgKey);
  //   if (!exists) {
  //     throw new Error(`The Org ${orgId} does not exists`);
  //   }
  //   const orgIds = await this.GetContentByKey(ctx, ALL_ORG_KEY);
  //   const index = orgIds.indexOf(orgId);
  //   orgIds.splice(index, 1);
  //   await ctx.stub.putState(ALL_ORG_KEY, Buffer.from(stringify(orgIds)));

  //   return ctx.stub.deleteState(orgKey);
  // }

  // @Transaction(false)
  // @Returns("string")
  // async ReadAllOrgKeys(ctx: Context): Promise<string> {
  //   const _orgIds = await ctx.stub.getState(ALL_ORG_KEY);
  //   return _orgIds.toString();
  // }

  // @Transaction(false)
  // async IsAdmin(ctx: Context): Promise<boolean> {
  //   const ADMINS = await this.GetContentByKey(ctx, ADMIN_ORG_KEY);
  //   if (ADMINS.includes(ctx.clientIdentity.getMSPID())) {
  //     return true;
  //   }
  //   return false;
  // }

  // @Transaction(false)
  // async IsOrgOwner(ctx: Context): Promise<boolean> {
  //   return true;
  // }

  // @Transaction(false)
  // @Returns("string")
  // public async ReadOrg(ctx: Context, orgId: string): Promise<string> {
  //   const orgKey = this.GetOrgKey(ctx, orgId);
  //   const orgJSON = await ctx.stub.getState(orgKey);
  //   if (!orgJSON || orgJSON.length === 0) {
  //     throw new Error(`The org ${orgId} does not exist`);
  //   }
  //   return orgJSON.toString();
  // }

  // @Transaction(false)
  // public async ReadAllOrgs(ctx: Context): Promise<Array<string>> {
  //   const orgIds = await this.GetContentByKey(ctx, ALL_ORG_KEY);
  //   console.info(`ReadAllOrgs: `, orgIds);
  //   const orgs = [];
  //   for (const orgId of orgIds) {
  //     const org = await this.ReadOrg(ctx, orgId);
  //     orgs.push(org);
  //   }
  //   return orgs;
  // }

  // @Transaction(false)
  // @Returns("boolean")
  // public async OrgExists(ctx: Context, id: string): Promise<boolean> {
  //   const orgJSON = await ctx.stub.getState(id);
  //   console.info("orgJSON: ", orgJSON.toString());
  //   return orgJSON && orgJSON.length > 0;
  // }
  // async GetContentByKey(ctx: Context, key: string): Promise<any> {
  //   const _content = await ctx.stub.getState(key);
  //   const content = JSON.parse(_content.toString());
  //   return content;
  // }

  // @Transaction(false)
  // @Returns("number")
  // public async CheckOrgAccess(ctx: Context, orgId: string): Promise<number> {
  //   const orgKey = this.GetOrgKey(ctx, orgId);
  //   const org = await this.GetContentByKey(ctx, orgKey);
  //   return org.access;
  // }
  // @Transaction()
  // public async UpdateOrgAccess(
  //   ctx: Context,
  //   orgId: string,
  //   access: number
  // ): Promise<void> {
  //   const orgKey = this.GetOrgKey(ctx, orgId);
  //   const exists = await this.OrgExists(ctx, orgKey);
  //   if (!exists) {
  //     throw new Error(`The Org ${orgId} does not exists`);
  //   }
  //   const org = await this.GetContentByKey(ctx, orgKey);
  //   org.access = access;
  //   await ctx.stub.putState(
  //     orgKey,
  //     Buffer.from(stringify(sortKeysRecursive(org)))
  //   );
  // }

  // @Transaction()
  // async AddUser(
  //   ctx: Context,
  //   userId: string,
  //   email: string,
  //   phone: string,
  //   //
  //   datasets: string,
  //   access: number,
  //   expiredAt: number
  // ): Promise<void> {
  //   // const permission = new Permission();
  //   // permission.access = WRITE | READ | DELETE;
  //   // permission.expiredAt = -1;
  //   // permission.datasets = ["*"];
  //   // const user = new User();
  //   // user.id = userId;
  //   // user.email = email;
  //   // user.phone = phone;
  //   // user.orgIds = [ctx.clientIdentity.getMSPID()];
  //   // user.permission = permission;
  //   // const userKey = await this.GetUserKey(ctx, user.id);
  //   // await ctx.stub.putState(
  //   //   userKey,
  //   //   Buffer.from(stringify(sortKeysRecursive(user)))
  //   // );
  // }

  // @Transaction()
  // async AddUser(ctx: Context, user: User): Promise<void> {
  //   const userKey = await this.GetUserKey(ctx, user.id);
  //   if (!user["orgIds"]) {
  //     user["orgIds"] = [ctx.clientIdentity.getMSPID()];
  //   }

  //   await ctx.stub.putState(
  //     userKey,
  //     Buffer.from(stringify(sortKeysRecursive(user)))
  //   );
  //   console.info(`[AddUser] ${JSON.stringify(user)}`);
  // }

  // @Transaction()
  // async RemoveUser(ctx: Context, userId: string): Promise<void> {
  //   const userKey = await this.GetUserKey(ctx, userId);
  //   await ctx.stub.deleteState(userKey);
  // }

  // @Transaction(false)
  // @Returns("User")
  // async GetUser(ctx: Context, userId: string): Promise<User> {
  //   const userKey = await this.GetUserKey(ctx, userId);
  //   const user = await this.GetContentByKey(ctx, userKey);
  //   return user as User;
  // }

  // @Transaction()
  // async RemoveUser(ctx: Context, userId: string): Promise<void> {
  //   const orgId = ctx.clientIdentity.getMSPID();
  //   const orgKey = this.GetOrgKey(ctx, orgId);
  //   const exists = await this.OrgExists(ctx, orgKey);
  //   if (!exists) {
  //     throw new Error(`The Org ${orgId} does not exists`);
  //   }
  //   const org = await this.GetContentByKey(ctx, orgKey);
  //   const index = org.users.indexOf(userId);
  //   if (index >= 0) {
  //     org.users.splice(index, 1);
  //     await ctx.stub.putState(
  //       orgKey,
  //       Buffer.from(stringify(sortKeysRecursive(org)))
  //     );
  //   }
  // }
  // @Transaction(false)
  // @Returns("number")
  // async CheckUserAccess(
  //   ctx: Context,
  //   orgId: string,
  //   userId: string
  // ): Promise<number> {
  //   const orgKey = this.GetOrgKey(ctx, orgId);
  //   const org = await this.GetContentByKey(ctx, orgKey);
  //   const index = org.users.indexOf(userId);
  //   if (index >= 0) {
  //     return org.access;
  //   }
  //   // No Permission
  //   return 0;
  // }
}
