export type UserRole = "admin" | "operator";

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserWithPinHash extends User {
  pin_hash: string;
}

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

export interface SessionPayload {
  sub: string; // user id
  username: string;
  name: string;
  role: UserRole;
  iat: number;
  exp: number;
}
