import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const AdminShopsController = () => import('#modules/admin/controllers/admin_shops_controller')

router
  .group(() => {
    router.on('/admin').redirectToPath('/admin/shops').as('admin.home')
    router.get('/admin/shops', [AdminShopsController, 'index']).as('admin.shops.index')
    router
      .post('/api/v1/admin/shops/:id/status', [AdminShopsController, 'updateStatus'])
      .as('api.admin.shops.status')
  })
  .use([middleware.auth(), middleware.admin()])
