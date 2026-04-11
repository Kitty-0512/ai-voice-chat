import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import Vant from 'vant'
import 'vant/lib/index.css'
import './style.css' // 引入你的全局样式

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(Vant)
app.mount('#app')