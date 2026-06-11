import '../styles.css';
import * as App from './app.js';
import { registerGlobals } from './register-globals.js';
import { boot } from './boot.js';

registerGlobals(App);
boot(App);
