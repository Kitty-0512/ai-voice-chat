import { createRouter, createWebHistory } from 'vue-router'

// 暂时先指向 App.vue，或者你可以创建一个空的 Home.vue
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../App.vue') // 暂时指向主页
    }
  ]
})

export default router