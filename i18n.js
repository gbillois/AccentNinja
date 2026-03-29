/* AccentNinja i18n - Bilingual string table (FR/EN)
 * Usage: import { t, setLanguage } from './i18n.js';
 */

const STRINGS = {
  fr: {
    'app.title': 'AccentNinja',
    'app.subtitle': 'Coach de prononciation anglaise',
    'app.tagline': 'Pour les francophones qui veulent parler anglais sans accent',

    'nav.home': 'Accueil',
    'nav.practice': 'Pratiquer',
    'nav.settings': 'Paramètres',
    'nav.back': 'Retour',
    'nav.results': 'Résultats',

    'splash.loading': 'Chargement...',

    'setup.title': 'Bienvenue sur AccentNinja',
    'setup.subtitle': 'Coach de prononciation anglaise pour francophones',
    'setup.azureTitle': 'Connexion Azure (optionnel)',
    'setup.azureInfo': 'Ajoutez une clé Azure Speech pour obtenir une évaluation phonème par phonème. Gratuit jusqu\'à 5h/mois.',
    'setup.azureLink': 'Obtenir une clé gratuite →',
    'setup.start': 'Commencer',
    'setup.skip': 'Continuer sans Azure',
    'setup.saving': 'Enregistrement...',

    'settings.title': 'Paramètres',
    'settings.ttsEngine.label': 'Synthèse vocale (TTS)',
    'settings.ttsEngine.web': 'Web Speech (gratuit)',
    'settings.ttsEngine.azure': 'Azure TTS (premium)',
    'settings.assessmentEngine.label': 'Moteur d\'évaluation',
    'settings.assessmentEngine.web': 'Web Speech (basique)',
    'settings.assessmentEngine.azure': 'Azure (recommandé)',
    'settings.azureSection': 'Identifiants Azure',
    'settings.azureApiKey.label': 'Clé API Azure Speech',
    'settings.azureApiKey.placeholder': 'Collez votre clé ici (32 caractères)',
    'settings.azureRegion.label': 'Région Azure',
    'settings.accentTarget.label': 'Accent cible',
    'settings.accentTarget.us': 'Américain (US)',
    'settings.accentTarget.uk': 'Britannique (UK)',
    'settings.ttsVoice.label': 'Voix de synthèse',
    'settings.ttsVoice.loading': 'Chargement des voix...',
    'settings.ttsVoice.none': 'Aucune voix disponible',
    'settings.ttsVoice.default': 'Voix par défaut',
    'settings.preferences': 'Préférences',
    'settings.language.label': 'Langue de l\'interface',
    'settings.theme.label': 'Thème',
    'settings.theme.dark': 'Sombre',
    'settings.theme.light': 'Clair',
    'settings.save': 'Enregistrer',
    'settings.saved': 'Paramètres enregistrés',
    'settings.testConnection': 'Tester la connexion Azure',
    'settings.connectionOk': 'Connexion réussie ✓',
    'settings.connectionFail': 'Échec de connexion',
    'settings.testing': 'Test en cours...',

    'home.title': 'Choisissez votre niveau',
    'home.level': 'Niveau',
    'home.quickStart': 'Démarrage rapide',
    'home.progress': 'Votre progression',
    'home.levels.coming': 'Les niveaux arrivent bientôt (Partie 2)',
    'home.level.locked': 'Verrouillé',
    'home.level.complete': 'Terminé',

    'practice.listen': 'Écouter le modèle',
    'practice.record': 'Enregistrer',
    'practice.stop': 'Arrêter',
    'practice.replay': 'Rejouer votre enregistrement',
    'practice.next': 'Suivant',
    'practice.skip': 'Passer',
    'practice.coming': 'Mode pratique à venir (Partie 2)',

    'results.title': 'Résultats',
    'results.score': 'Score',
    'results.accuracy': 'Précision',
    'results.fluency': 'Fluidité',
    'results.completeness': 'Complétude',
    'results.prosody': 'Prosodie',
    'results.coming': 'Résultats à venir (Partie 2)',

    'engine.connecting': 'Connexion du microphone...',
    'engine.recording': 'Enregistrement en cours... Parlez maintenant',
    'engine.processing': 'Analyse en cours...',
    'engine.done': 'Analyse terminée',
    'engine.stopping': 'Arrêt en cours...',

    'error.noMic': 'Microphone non disponible. Vérifiez les permissions.',
    'error.noApiKey': 'Clé API Azure requise pour ce moteur.',
    'error.networkError': 'Erreur réseau. Vérifiez votre connexion.',
    'error.sdkNotLoaded': 'SDK Azure non chargé. Vérifiez votre connexion internet.',
    'error.offline': 'Vous êtes hors ligne. Le mode Azure nécessite internet.',
    'error.timeout': 'Délai dépassé. Réessayez.',
    'error.noSpeech': 'Aucune voix reconnue. Parlez plus fort ou plus près du microphone.',
    'error.browserNotSupported': 'Navigateur non supporté. Utilisez Chrome, Edge ou Safari récent.',
    'error.unknown': 'Erreur inconnue. Réessayez.',

    'badge.azure': 'Azure',
    'badge.web': 'Web',
    'badge.offline': 'Hors ligne',
    'badge.free': 'Gratuit',
    'badge.premium': 'Premium',
  },

  en: {
    'app.title': 'AccentNinja',
    'app.subtitle': 'English Pronunciation Coach',
    'app.tagline': 'For French speakers who want to speak English without an accent',

    'nav.home': 'Home',
    'nav.practice': 'Practice',
    'nav.settings': 'Settings',
    'nav.back': 'Back',
    'nav.results': 'Results',

    'splash.loading': 'Loading...',

    'setup.title': 'Welcome to AccentNinja',
    'setup.subtitle': 'English pronunciation coach for French speakers',
    'setup.azureTitle': 'Azure Connection (optional)',
    'setup.azureInfo': 'Add an Azure Speech key for phoneme-level assessment. Free up to 5h/month.',
    'setup.azureLink': 'Get a free key →',
    'setup.start': 'Get Started',
    'setup.skip': 'Continue without Azure',
    'setup.saving': 'Saving...',

    'settings.title': 'Settings',
    'settings.ttsEngine.label': 'Text-to-Speech Engine',
    'settings.ttsEngine.web': 'Web Speech (free)',
    'settings.ttsEngine.azure': 'Azure TTS (premium)',
    'settings.assessmentEngine.label': 'Assessment Engine',
    'settings.assessmentEngine.web': 'Web Speech (basic)',
    'settings.assessmentEngine.azure': 'Azure (recommended)',
    'settings.azureSection': 'Azure Credentials',
    'settings.azureApiKey.label': 'Azure Speech API Key',
    'settings.azureApiKey.placeholder': 'Paste your key here (32 characters)',
    'settings.azureRegion.label': 'Azure Region',
    'settings.accentTarget.label': 'Target Accent',
    'settings.accentTarget.us': 'American English (US)',
    'settings.accentTarget.uk': 'British English (UK)',
    'settings.ttsVoice.label': 'TTS Voice',
    'settings.ttsVoice.loading': 'Loading voices...',
    'settings.ttsVoice.none': 'No voices available',
    'settings.ttsVoice.default': 'Default voice',
    'settings.preferences': 'Preferences',
    'settings.language.label': 'Interface Language',
    'settings.theme.label': 'Theme',
    'settings.theme.dark': 'Dark',
    'settings.theme.light': 'Light',
    'settings.save': 'Save Settings',
    'settings.saved': 'Settings saved',
    'settings.testConnection': 'Test Azure Connection',
    'settings.connectionOk': 'Connection successful ✓',
    'settings.connectionFail': 'Connection failed',
    'settings.testing': 'Testing...',

    'home.title': 'Choose Your Level',
    'home.level': 'Level',
    'home.quickStart': 'Quick Start',
    'home.progress': 'Your Progress',
    'home.levels.coming': 'Levels coming soon (Part 2)',
    'home.level.locked': 'Locked',
    'home.level.complete': 'Complete',

    'practice.listen': 'Listen to Model',
    'practice.record': 'Record',
    'practice.stop': 'Stop',
    'practice.replay': 'Replay Your Recording',
    'practice.next': 'Next',
    'practice.skip': 'Skip',
    'practice.coming': 'Practice mode coming soon (Part 2)',

    'results.title': 'Results',
    'results.score': 'Score',
    'results.accuracy': 'Accuracy',
    'results.fluency': 'Fluency',
    'results.completeness': 'Completeness',
    'results.prosody': 'Prosody',
    'results.coming': 'Results coming soon (Part 2)',

    'engine.connecting': 'Connecting microphone...',
    'engine.recording': 'Recording... Speak now',
    'engine.processing': 'Processing...',
    'engine.done': 'Assessment complete',
    'engine.stopping': 'Stopping...',

    'error.noMic': 'Microphone unavailable. Check browser permissions.',
    'error.noApiKey': 'Azure API key required for this engine.',
    'error.networkError': 'Network error. Check your connection.',
    'error.sdkNotLoaded': 'Azure SDK not loaded. Check your internet connection.',
    'error.offline': 'You are offline. Azure mode requires internet.',
    'error.timeout': 'Request timed out. Please try again.',
    'error.noSpeech': 'No speech detected. Speak louder or closer to the microphone.',
    'error.browserNotSupported': 'Browser not supported. Use a recent Chrome, Edge or Safari.',
    'error.unknown': 'Unknown error. Please try again.',

    'badge.azure': 'Azure',
    'badge.web': 'Web',
    'badge.offline': 'Offline',
    'badge.free': 'Free',
    'badge.premium': 'Premium',
  },
};

let currentLanguage = 'fr';

/**
 * Translate a key to the current language.
 * Falls back to 'fr', then to the key itself.
 */
export function t(key) {
  return STRINGS[currentLanguage]?.[key]
    ?? STRINGS['fr']?.[key]
    ?? key;
}

/**
 * Set the active language ('fr' or 'en').
 */
export function setLanguage(lang) {
  if (lang === 'fr' || lang === 'en') {
    currentLanguage = lang;
  }
}

export function getLanguage() {
  return currentLanguage;
}

export const SUPPORTED_LANGUAGES = ['fr', 'en'];
