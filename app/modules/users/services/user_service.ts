import User from '#models/user'

export default class UserService {
  /*
   * Create a new user
   */
  async create(userPayload: CreateUserPayload) {
    const user = await User.create(userPayload)
    return user
  }
}

type CreateUserPayload = {
  fullName: string
  email: string
  phone?: string
  password: string
}
