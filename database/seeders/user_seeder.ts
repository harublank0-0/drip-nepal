import { UserFactory } from '#database/factories/user_factory'
import User from '#models/user'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

const demoUsers = [
  {
    email: 'dripuser1@dripnepal.com',
    password: 'user1',
  },

  {
    email: 'dripuser2@dripnepal.com',
    password: 'user2',
  },

  {
    email: 'dripuser3@dripnepal.com',
    password: 'user3',
  },

  {
    email: 'dripuser4@dripnepal.com',
    password: 'user4',
  },

  {
    email: 'dripuser5@dripnepal.com',
    password: 'user5',
  },
]

export default class extends BaseSeeder {
  async run() {
    for (const user of demoUsers) {
      await User.updateOrCreate({ email: user.email }, user)
    }

    await UserFactory.createMany(10)
  }
}
