export const UserStatus = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
  DELETED: 'deleted',
} as const

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]

export const UserStatusValues = Object.values(UserStatus)
