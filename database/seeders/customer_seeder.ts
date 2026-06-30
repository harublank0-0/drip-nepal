// import { UserFactory } from '#database/factories/user_factory'
// import User from '#models/user'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

// const demoUsers = [
//   {
//     full_name: 'drip customer 1',
//     email: 'dripcustomer1@dripnepal.com',
//     password: 'user1',
//   },
//
//   {
//     full_name: 'drip customer 2',
//     email: 'dripcustomer2@dripnepal.com',
//     password: 'user2',
//   },
//
//   {
//     full_name: 'drip customer 3',
//     email: 'dripcustomer3@dripnepal.com',
//     password: 'user3',
//   },
//
//   {
//     full_name: 'drip customer 4',
//     email: 'dripcustomer4@dripnepal.com',
//     password: 'user4',
//   },
// ]

export default class extends BaseSeeder {
  async run() {
    // for (const user of demoUsers) {
    //   const userExists = await User.findBy('email', user.email)
    //   if (!userExists) {
    //     await UserFactory.merge(user).create()
    //   }
    // }
    //
    // await UserFactory.createMany(10)
  }
}
