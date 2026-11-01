import '../styles.css';
import * as App from './app.js';
import { bindEvents } from './bind-events.js';
import { boot } from './boot.js';
import { hydrateIcons } from './icons.js';

hydrateIcons();

bindEvents(App);
boot(App);
