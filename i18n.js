// i18n.js - AccentNinja Bilingual String Table (FR/EN)

export const i18n = {
  fr: {
    // App
    home_title: "AccentNinja",
    app_tagline: "Coach de prononciation anglaise",

    // Navigation
    settings: "Réglages",
    statistics: "Statistiques",
    back: "Retour",

    // Home screen
    start_practice: "Commencer l'entraînement",
    continue_practice: "Continuer",
    words: "Mots",
    phrases: "Phrases",
    minimal_pairs: "Paires minimales",
    shadowing: "Écoute et répète",
    level_label: "Niveau",
    daily_goal_progress: "{done}/{goal} aujourd'hui",
    streak: "Série",
    days_in_a_row: "jours d'affilée",
    ready_today: "Prêt pour la session du jour ?",

    // Practice
    listen: "Écouter",
    listen_slow: "Lent",
    listen_again: "Réécouter",
    listen_slow_full: "Écouter lentement",
    your_recording: "Votre enregistrement",
    speak_now: "Parlez maintenant",
    tap_to_speak: "Appuyez pour parler",
    processing: "Analyse en cours...",
    retry: "Réessayer",
    next: "Suivant",
    skip: "Passer",
    auto_advancing: "Suite automatique...",

    // Scores
    score: "Score",
    accuracy: "Précision",
    fluency: "Fluidité",
    completeness: "Complétude",
    prosody: "Prosodie",
    confidence: "Confiance",

    // Verdicts
    excellent: "Excellent",
    good: "Bien",
    needs_work: "À travailler",
    incorrect: "Incorrect",

    // Word error types
    mispronunciation: "Mauvaise prononciation",
    omission: "Mot omis",
    insertion: "Mot ajouté",

    // Phoneme tips header
    tip_header: "Conseil",

    // Ninja mode labels
    chain: "CHAÎNE",
    sharp_label: "PRÉCIS",
    flawless: "SANS FAUTE",
    master: "MASTER !",
    ninja_summary: "Résumé",

    // Minimal pairs
    say_this_one: "Dites celui-ci",
    listen_both: "Écouter les deux",

    // Shadowing
    shadowing_title: "Écoute et répète",
    shadowing_stop: "Arrêter",
    shadowing_speed: "Vitesse",
    shadowing_normal: "Normale",
    shadowing_slow: "Lente (0.7x)",
    auto_advance: "Avance auto",
    show_text: "Afficher le texte",

    // Session
    session_progress: "{done}/{goal} éléments",
    session_summary: "Résumé de la session",
    items_practiced: "Éléments pratiqués",
    average_accuracy: "Précision moyenne",
    best_item: "Meilleur mot",
    hardest_item: "Mot le plus difficile",
    focus_phonemes: "Phonèmes à travailler",
    practice_more: "Continuer",
    done: "Terminé",
    end_session: "Terminer la session",

    // Statistics
    total_practice_time: "Temps de pratique total",
    items_today: "Éléments aujourd'hui",
    items_this_week: "Éléments cette semaine",
    phoneme_heatmap: "Carte des phonèmes",
    weakest_phonemes: "Phonèmes les plus difficiles",
    progress_over_time: "Progression",
    not_attempted: "Non essayé",
    attempts: "tentatives",
    avg_accuracy: "Précision moyenne",
    tap_for_drills: "Touchez pour des exercices ciblés",

    // Settings
    settings_title: "Réglages",
    assessment_engine: "Moteur d'évaluation",
    tts_engine: "Synthèse vocale",
    azure_recommended: "Azure (recommandé)",
    webspeech_basic: "Web Speech (basique)",
    azure_tts: "Azure TTS (qualité premium)",
    webspeech_tts: "Web Speech API (gratuit)",
    api_key: "Clé API Azure",
    api_key_placeholder: "Entrez votre clé Azure...",
    region: "Région Azure",
    test_key: "Tester la clé",
    key_valid: "Clé valide ✓",
    key_invalid: "Clé invalide ✗",
    accent: "Accent cible",
    us_english: "Anglais américain",
    uk_english: "Anglais britannique",
    tts_voice: "Voix TTS",
    daily_goal: "Objectif quotidien",
    daily_goal_items: "{n} éléments par jour",
    language: "Langue de l'interface",
    french: "Français",
    english: "English",
    theme: "Thème",
    dark_theme: "Sombre",
    light_theme: "Clair",
    results_display: "Animation des résultats",
    classic_mode: "Classique (retour détaillé)",
    ninja_mode: "Ninja (animé + détail au tap)",
    placement_test: "Test de niveau",
    retake_placement: "Refaire le test de niveau",
    export_profile: "Exporter le profil",
    import_profile: "Importer un profil",
    azure_usage: "Utilisation Azure ce mois",
    azure_usage_detail: "{used} / 5h 00min",
    azure_warn_80: "Vous avez utilisé 80% de votre quota Azure.",
    azure_warn_95: "Quota Azure presque épuisé. Passez à Web Speech API.",
    azure_exceeded: "Quota mensuel Azure atteint. Basculement sur Web Speech API.",
    offline_mode: "Mode hors-ligne - évaluation de base uniquement",
    offline_badge: "Hors ligne",

    // First launch
    welcome_title: "Bienvenue sur AccentNinja",
    welcome_desc: "AccentNinja vous aide à améliorer votre prononciation anglaise. Pratiquez des mots et des phrases, obtenez un retour détaillé phonème par phonème, et suivez vos progrès.",
    get_started: "Commencer",
    setup_azure_title: "Configurer l'analyse de prononciation",
    setup_azure_desc: "Pour un retour détaillé sur chaque son que vous prononcez, AccentNinja utilise l'analyse de prononciation Microsoft Azure. C'est gratuit jusqu'à 5 heures de pratique par mois.",
    have_azure_key: "J'ai une clé Azure",
    setup_azure: "Configurer Azure (gratuit)",
    skip_for_now: "Passer pour l'instant",
    skip_warning: "Vous aurez un retour basique uniquement. Vous pourrez ajouter une clé Azure à tout moment dans les Réglages.",
    open_azure_portal: "Ouvrir le portail Azure",

    // Azure guide
    azure_guide_title: "Comment obtenir votre clé Azure (gratuit) :",
    azure_step1: "1. Allez sur https://portal.azure.com\nCréez un compte Microsoft si vous n'en avez pas (gratuit).",
    azure_step2: "2. Dans la barre de recherche en haut, tapez \"Speech\" et sélectionnez \"Speech services\".",
    azure_step3: "3. Cliquez sur \"+ Create\" (Créer).",
    azure_step4: "4. Remplissez :\n• Subscription : votre abonnement (ou \"Free Trial\")\n• Resource group : cliquez \"Create new\", nommez-le \"accentninja\"\n• Region : \"West Europe\" (ou la plus proche de vous)\n• Name : \"accentninja-speech\"\n• Pricing tier : \"Free F0\" (5 heures/mois gratuites)",
    azure_step5: "5. Cliquez \"Review + Create\" puis \"Create\". Attendez 30 secondes.",
    azure_step6: "6. Une fois créé, cliquez \"Go to resource\".",
    azure_step7: "7. Dans le menu de gauche, cliquez \"Keys and Endpoint\".",
    azure_step8: "8. Copiez \"KEY 1\" et collez-la dans le champ ci-dessous. La région est celle que vous avez choisie (ex: westeurope).",

    // Microphone
    mic_title: "Accès au microphone",
    mic_desc: "AccentNinja a besoin du micro pour écouter votre prononciation",
    allow_microphone: "Autoriser le micro",
    mic_denied_title: "Accès refusé",
    mic_denied_ios: "Pour autoriser le micro :\nRéglages > Safari > Microphone > Autoriser",
    mic_denied_android: "Pour autoriser le micro :\nParamètres > Applis > Navigateur > Autorisations > Microphone",
    try_again: "Réessayer",
    mic_granted: "Microphone autorisé ✓",

    // Placement test
    placement_title: "Test de niveau",
    placement_desc: "20 éléments pour évaluer votre niveau. Environ 3-5 minutes.",
    placement_start: "Commencer le test",
    placement_progress: "{done}/20",
    placement_results_title: "Résultats du test",
    placement_level: "Niveau recommandé : {level}",
    placement_strengths: "Points forts",
    placement_improve: "À améliorer",
    go_to_home: "Accueil",

    // Errors
    error_mic_short: "Parlez plus longtemps (min. 0,5 s)",
    error_no_speech: "Aucune parole détectée. Réessayez.",
    error_network: "Erreur réseau. Vérifiez votre connexion.",
    error_azure_auth: "Clé Azure invalide. Vérifiez dans les Réglages.",
    error_azure_quota: "Quota Azure épuisé pour ce mois.",
    error_generic: "Une erreur est survenue. Réessayez.",

    // Level names
    level_names: [
      "Le /h/ silencieux",
      "Les fricatives dentales",
      "Le /r/ anglais",
      "Voyelles courtes vs longues",
      "Les diphtongues",
      "L'accentuation",
      "Le schwa /ə/",
      "Groupes consonantiques",
      "Discours connecté",
      "Niveau natif"
    ],

    // Import/Export
    export_success: "Profil exporté !",
    import_confirm: "Remplacer votre profil actuel par ce fichier ?",
    import_success: "Profil importé !",
    import_error: "Fichier invalide.",
    confirm_yes: "Oui, remplacer",
    confirm_no: "Annuler",
    reset_level_confirm: "Refaire le test de niveau réinitialisera votre niveau. Continuer ?",

    // Level up/down
    level_up_title: "Niveau suivant !",
    level_up_desc: "Votre précision dépasse 80%. Passez au niveau {level} ?",
    level_down_title: "Retour en arrière ?",
    level_down_desc: "Votre précision est en dessous de 40%. Revenir au niveau {level} ?",
    level_change_yes: "Oui",
    level_change_no: "Rester",

    // Minimal pairs specific
    correct_word_good: "Bon mot, bonne prononciation !",
    correct_word_imprecise: "Bon mot, mais la prononciation peut s'améliorer.",
    wrong_word_detected: "Le mot \"{word}\" a été détecté. Essayez à nouveau !",
  },

  en: {
    // App
    home_title: "AccentNinja",
    app_tagline: "English pronunciation coach",

    // Navigation
    settings: "Settings",
    statistics: "Statistics",
    back: "Back",

    // Home screen
    start_practice: "Start Practice",
    continue_practice: "Continue",
    words: "Words",
    phrases: "Phrases",
    minimal_pairs: "Minimal Pairs",
    shadowing: "Shadowing",
    level_label: "Level",
    daily_goal_progress: "{done}/{goal} today",
    streak: "Streak",
    days_in_a_row: "days in a row",
    ready_today: "Ready for today's session?",

    // Practice
    listen: "Listen",
    listen_slow: "Slow",
    listen_again: "Listen Again",
    listen_slow_full: "Listen Slow",
    your_recording: "Your Recording",
    speak_now: "Speak now",
    tap_to_speak: "Tap to speak",
    processing: "Analyzing...",
    retry: "Retry",
    next: "Next",
    skip: "Skip",
    auto_advancing: "Auto-advancing...",

    // Scores
    score: "Score",
    accuracy: "Accuracy",
    fluency: "Fluency",
    completeness: "Completeness",
    prosody: "Prosody",
    confidence: "Confidence",

    // Verdicts
    excellent: "Excellent",
    good: "Good",
    needs_work: "Needs Work",
    incorrect: "Incorrect",

    // Word error types
    mispronunciation: "Mispronunciation",
    omission: "Word omitted",
    insertion: "Extra word",

    // Phoneme tips header
    tip_header: "Tip",

    // Ninja mode labels
    chain: "CHAIN",
    sharp_label: "SHARP",
    flawless: "FLAWLESS",
    master: "MASTER!",
    ninja_summary: "Summary",

    // Minimal pairs
    say_this_one: "Say this one",
    listen_both: "Listen Both",

    // Shadowing
    shadowing_title: "Shadowing",
    shadowing_stop: "Stop",
    shadowing_speed: "Speed",
    shadowing_normal: "Normal",
    shadowing_slow: "Slow (0.7x)",
    auto_advance: "Auto-advance",
    show_text: "Show text",

    // Session
    session_progress: "{done}/{goal} items",
    session_summary: "Session Summary",
    items_practiced: "Items practiced",
    average_accuracy: "Average accuracy",
    best_item: "Best item",
    hardest_item: "Hardest item",
    focus_phonemes: "Phonemes to focus on",
    practice_more: "Practice More",
    done: "Done",
    end_session: "End Session",

    // Statistics
    total_practice_time: "Total practice time",
    items_today: "Items today",
    items_this_week: "Items this week",
    phoneme_heatmap: "Phoneme Map",
    weakest_phonemes: "Weakest Phonemes",
    progress_over_time: "Progress Over Time",
    not_attempted: "Not attempted",
    attempts: "attempts",
    avg_accuracy: "Average accuracy",
    tap_for_drills: "Tap for targeted drills",

    // Settings
    settings_title: "Settings",
    assessment_engine: "Assessment Engine",
    tts_engine: "Text-to-Speech",
    azure_recommended: "Azure (recommended)",
    webspeech_basic: "Web Speech (basic)",
    azure_tts: "Azure TTS (premium quality)",
    webspeech_tts: "Web Speech API (free)",
    api_key: "Azure API Key",
    api_key_placeholder: "Enter your Azure key...",
    region: "Azure Region",
    test_key: "Test Key",
    key_valid: "Key valid ✓",
    key_invalid: "Key invalid ✗",
    accent: "Target Accent",
    us_english: "American English",
    uk_english: "British English",
    tts_voice: "TTS Voice",
    daily_goal: "Daily Goal",
    daily_goal_items: "{n} items per day",
    language: "Interface Language",
    french: "Français",
    english: "English",
    theme: "Theme",
    dark_theme: "Dark",
    light_theme: "Light",
    results_display: "Results Animation",
    classic_mode: "Classic (detailed feedback)",
    ninja_mode: "Ninja (animated + detailed on tap)",
    placement_test: "Placement Test",
    retake_placement: "Retake Placement Test",
    export_profile: "Export Profile",
    import_profile: "Import Profile",
    azure_usage: "Azure usage this month",
    azure_usage_detail: "{used} / 5h 00min",
    azure_warn_80: "You have used 80% of your Azure quota.",
    azure_warn_95: "Azure quota almost exhausted. Consider switching to Web Speech API.",
    azure_exceeded: "Monthly Azure quota reached. Switched to Web Speech API.",
    offline_mode: "Offline mode - basic assessment only",
    offline_badge: "Offline",

    // First launch
    welcome_title: "Welcome to AccentNinja",
    welcome_desc: "AccentNinja helps you improve your English pronunciation. Practice words and phrases, get detailed phoneme-level feedback, and track your progress.",
    get_started: "Get Started",
    setup_azure_title: "Set up pronunciation analysis",
    setup_azure_desc: "For detailed feedback on each sound you pronounce, AccentNinja uses Microsoft Azure's pronunciation analysis. It's free for up to 5 hours of practice per month.",
    have_azure_key: "I have an Azure key",
    setup_azure: "Set up Azure (free)",
    skip_for_now: "Skip for now",
    skip_warning: "You'll get basic feedback only. You can add an Azure key anytime in Settings.",
    open_azure_portal: "Open Azure Portal",

    // Azure guide
    azure_guide_title: "How to get your Azure key (free):",
    azure_step1: "1. Go to https://portal.azure.com\nCreate a Microsoft account if you don't have one (free).",
    azure_step2: "2. In the search bar at the top, type \"Speech\" and select \"Speech services\".",
    azure_step3: "3. Click \"+ Create\".",
    azure_step4: "4. Fill in:\n• Subscription: your subscription (or \"Free Trial\")\n• Resource group: click \"Create new\", name it \"accentninja\"\n• Region: \"West Europe\" (or the closest to you)\n• Name: \"accentninja-speech\"\n• Pricing tier: \"Free F0\" (5 free hours/month)",
    azure_step5: "5. Click \"Review + Create\" then \"Create\". Wait 30 seconds.",
    azure_step6: "6. Once created, click \"Go to resource\".",
    azure_step7: "7. In the left menu, click \"Keys and Endpoint\".",
    azure_step8: "8. Copy \"KEY 1\" and paste it in the field below. The region is the one you chose (e.g. westeurope).",

    // Microphone
    mic_title: "Microphone Access",
    mic_desc: "AccentNinja needs microphone access to hear your pronunciation",
    allow_microphone: "Allow Microphone",
    mic_denied_title: "Access Denied",
    mic_denied_ios: "To enable microphone:\nSettings > Safari > Microphone > Allow",
    mic_denied_android: "To enable microphone:\nSettings > Apps > Browser > Permissions > Microphone",
    try_again: "Try Again",
    mic_granted: "Microphone allowed ✓",

    // Placement test
    placement_title: "Placement Test",
    placement_desc: "20 items to assess your level. About 3-5 minutes.",
    placement_start: "Start Test",
    placement_progress: "{done}/20",
    placement_results_title: "Test Results",
    placement_level: "Recommended level: {level}",
    placement_strengths: "Strengths",
    placement_improve: "Areas to improve",
    go_to_home: "Go Home",

    // Errors
    error_mic_short: "Please speak longer (min 0.5s)",
    error_no_speech: "No speech detected. Please try again.",
    error_network: "Network error. Check your connection.",
    error_azure_auth: "Invalid Azure key. Check in Settings.",
    error_azure_quota: "Azure quota exhausted for this month.",
    error_generic: "An error occurred. Please try again.",

    // Level names
    level_names: [
      "Silent /h/ & Basic Vowels",
      "Dental Fricatives",
      "English /r/ Sound",
      "Short vs Long Vowels",
      "Diphthongs",
      "Word Stress",
      "The Schwa /ə/",
      "Consonant Clusters",
      "Connected Speech",
      "Native-Level Challenges"
    ],

    // Import/Export
    export_success: "Profile exported!",
    import_confirm: "Replace your current profile with this file?",
    import_success: "Profile imported!",
    import_error: "Invalid file.",
    confirm_yes: "Yes, replace",
    confirm_no: "Cancel",
    reset_level_confirm: "Retaking the placement test will reset your level. Continue?",

    // Level up/down
    level_up_title: "Level Up!",
    level_up_desc: "Your accuracy exceeds 80%. Move to level {level}?",
    level_down_title: "Step Back?",
    level_down_desc: "Your accuracy is below 40%. Move back to level {level}?",
    level_change_yes: "Yes",
    level_change_no: "Stay",

    // Minimal pairs specific
    correct_word_good: "Correct word, great pronunciation!",
    correct_word_imprecise: "Correct word, but pronunciation could be better.",
    wrong_word_detected: "The word \"{word}\" was detected. Try again!",
  }
};

export function t(lang, key, params = {}) {
  const strings = i18n[lang] || i18n.fr;
  let str = strings[key] || i18n.fr[key] || key;
  Object.entries(params).forEach(([k, v]) => {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  });
  return str;
}
