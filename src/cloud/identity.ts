import type { ManagedUser } from "../data/userAccessStore";

let identity: ManagedUser | null = null;
export function cloudIdentity() { return identity; }
export function setCloudIdentity(user: ManagedUser | null) { identity = user; }
