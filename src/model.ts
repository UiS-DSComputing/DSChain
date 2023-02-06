/*
  SPDX-License-Identifier: Apache-2.0
*/

import { Object, Property } from "fabric-contract-api";

@Object()
export class Org {
  @Property()
  public id: string;
  @Property()
  public access: number;
  @Property()
  public users: Array<string>;
}

@Object()
export class User {
  @Property()
  public id: string;
  @Property()
  public access: number;
  @Property()
  public orgId: string;
}
