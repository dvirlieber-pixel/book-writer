// Screen routing & welcome wizard
// ===== SCREEN MANAGEMENT =====
let welcomeWizardStep = 1;

const WELCOME_WIZARD_STEPS = 3;

function showScreen(id) {
  if (id !== 'reading-screen') {
    releaseWakeLock();
    document.body.classList.remove('reading-immersive');
    if (app.readingPrefs) app.readingPrefs.allowLandscape = false;
    lockAppOrientation();
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (!screen) return;
  screen.classList.add('active');
  window.scrollTo(0, 0);
  applyReadingPrefs();
  updateLandscapeToggleButton();
  if (id === 'welcome-screen') updateWelcomeWizardUI();
}

function showLibrary() {
  closeChapterDrawer();
  renderLibrary();
  showScreen('library-screen');
}

function validateWizardStep1() {
  const p = collectWelcomeProfile();
  const hasGenre = !!(p.genre && (p.genre !== 'other' || p.genreCustom?.trim()));
  const hasHook = !!p.hook?.trim();
  const hasAuthor = !!(p.author && (p.author !== 'other' || p.authorCustom?.trim()));
  const hasBookRef = !!(p.bookRef && (p.bookRef !== 'other' || p.bookRefCustom?.trim()));
  return hasGenre || hasHook || hasAuthor || hasBookRef;
}

function canSkipWelcomeWizard() {
  return !!getStoredApiKey() && validateWelcomeSelections();
}

function resetWelcomeWizard(step) {
  welcomeWizardStep = step || 1;
  const err = document.getElementById('welcome-error');
  if (err) err.style.display = 'none';
  updateWelcomeWizardUI();
}

function syncWelcomeApiKeyField() {
  const input = document.getElementById('api-key-input');
  const key = getStoredApiKey();
  if (input && key && !input.value.trim()) input.value = key;
  updateApiKeyStatus();
  refreshModelFallbackNotice('welcome-model-fallback-notice');
}

function updateWelcomeWizardUI() {
  for (let i = 1; i <= WELCOME_WIZARD_STEPS; i++) {
    const panel = document.getElementById(`wizard-step-${i}`);
    if (!panel) continue;
    const isActive = i === welcomeWizardStep;
    panel.classList.toggle('wizard-step-active', isActive);
    panel.hidden = !isActive;
    if (isActive) {
      panel.classList.remove('wizard-step-enter');
      void panel.offsetWidth;
      panel.classList.add('wizard-step-enter');
    }
  }

  document.querySelectorAll('.wizard-progress-step').forEach(btn => {
    const step = parseInt(btn.dataset.wizardStep, 10);
    const isActive = step === welcomeWizardStep;
    const isDone = step < welcomeWizardStep;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('done', isDone);
    btn.setAttribute('aria-current', isActive ? 'step' : 'false');
  });

  const skipBtn = document.getElementById('wizard-skip-to-create');
  if (skipBtn) {
    const showSkip = welcomeWizardStep < 3 && canSkipWelcomeWizard();
    skipBtn.style.display = showSkip ? 'inline-flex' : 'none';
  }

  const desc3 = document.getElementById('wizard-step-3-desc');
  if (desc3 && welcomeWizardStep === 3) {
    desc3.textContent = getStoredApiKey()
      ? 'המפתח שלך שמור במכשיר — אפשר לפתוח ספר מיד.'
      : 'הזינו מפתח Gemini חינמי — נשמר רק במכשיר שלכם.';
  }

  if (welcomeWizardStep === 3) syncWelcomeApiKeyField();
}

function setWelcomeWizardStep(step, { focusApi = false } = {}) {
  const next = Math.min(WELCOME_WIZARD_STEPS, Math.max(1, step));
  if (next > welcomeWizardStep && next > 1 && !validateWizardStep1()) {
    showError('welcome-error', 'בחר לפחות אחד: ז\'אנר, סופר, ספר, או רעיון חופשי.');
    return false;
  }
  document.getElementById('welcome-error').style.display = 'none';
  welcomeWizardStep = next;
  updateWelcomeWizardUI();
  window.scrollTo(0, 0);
  if (focusApi && welcomeWizardStep === 3) {
    setTimeout(() => document.getElementById('api-key-input')?.focus(), 120);
  }
  return true;
}

function nextWizardStep() {
  if (welcomeWizardStep === 1) {
    if (!validateWizardStep1()) {
      showError('welcome-error', 'בחר לפחות אחד: ז\'אנר, סופר, ספר, או רעיון חופשי.');
      return;
    }
    document.getElementById('welcome-error').style.display = 'none';
  }
  if (welcomeWizardStep < WELCOME_WIZARD_STEPS) {
    setWelcomeWizardStep(welcomeWizardStep + 1, { focusApi: welcomeWizardStep + 1 === 3 });
  }
}

function prevWizardStep() {
  if (welcomeWizardStep > 1) {
    document.getElementById('welcome-error').style.display = 'none';
    setWelcomeWizardStep(welcomeWizardStep - 1);
  }
}

function goToWizardStep(step) {
  const target = typeof step === 'number' ? step : parseInt(step, 10);
  if (!target || target < 1 || target > WELCOME_WIZARD_STEPS) return;
  if (target === welcomeWizardStep) return;
  if (target > 1 && !validateWizardStep1()) {
    showError('welcome-error', 'בחר לפחות אחד: ז\'אנר, סופר, ספר, או רעיון חופשי.');
    return;
  }
  setWelcomeWizardStep(target, { focusApi: target === 3 });
}

function applyWelcomeDefaults() {
  const p = app.readingPrefs || {};
  if (p.activeProfile) applyTasteProfile(p.activeProfile);
  else {
    const lk = p.defaultLengthKey || 'short';
    readingLengthKey = lk;
    state.totalChapters = LENGTH_PRESETS[lk]?.chapters || 15;
    syncWelcomeUIFromProfile(defaultBookProfile(), lk);
  }
  document.querySelectorAll('.optional-input').forEach(el => { el.style.display = 'none'; });
  resetWelcomeWizard(1);
}
