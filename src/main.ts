import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAiStore } from './stores/ai';
import './assets/element-plus.css';
import './assets/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// Load the shared AI config once at startup so Profile and Planner agree.
void useAiStore(pinia).load();

app.mount('#app');
