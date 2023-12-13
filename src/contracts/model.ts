import { Object, Property } from "fabric-contract-api";

// @Object()
// export class  {
//   @Property()
//   public expiredAt: number; // -1 means never expired
//   @Property()
//   public access: number; // read | write | delete
//   @Property()
//   public datasets: string;
// }

@Object()
export class User {
  @Property()
  public id: string;
  @Property()
  public name: string;
  @Property()
  public email: string;
  @Property()
  public phone: string;
  // @Property()
  // public access: number;
  @Property()
  public orgs: { [key: string]: boolean }; // key = orgId
}

@Object()
export class Org {
  @Property()
  public id: string;
  @Property()
  public name: string;
  @Property()
  public access: number;
  @Property()
  public users: { [key: string]: boolean }; // key = userId
  @Property()
  public pubs: { [key: string]: boolean }; // key = orgId
  @Property()
  public subs: { [key: string]: boolean }; // key = orgId
  @Property()
  public datasets: { [key: string]: number }; // key = dataset, value = access
}
