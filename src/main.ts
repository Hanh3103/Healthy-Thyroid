import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { applyPreferences, loadPreferences } from './features/settings/preferences';
import './assets/element-plus.css';
import './assets/main.css';

loadPreferences();
applyPreferences();

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

app.mount('#app');
