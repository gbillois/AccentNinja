/* AccentNinja Corpus
 * CORPUS, MINIMAL_PAIRS, PHONEME_TIPS — pronunciation training data.
 *
 * Schema (full definition in Part 3 spec):
 *
 * CORPUS[levelNumber] = {
 *   name: string,
 *   nameEn: string,
 *   description: string,
 *   focus: string[],           // phoneme targets for this level
 *   items: CorpusItem[],
 * }
 *
 * CorpusItem = {
 *   id: string,
 *   type: 'word' | 'phrase' | 'sentence',
 *   text: string,              // English text to pronounce
 *   ipa: string,               // IPA transcription
 *   translation: string,       // French translation
 *   difficulty: 1..10,
 *   focusPhonemes: string[],   // IPA phonemes this item targets
 *   tips: string[],            // Short pronunciation tips (FR)
 * }
 *
 * MINIMAL_PAIRS = MinimalPair[]
 * MinimalPair = {
 *   id: string,
 *   phonemeA: string,  // IPA
 *   phonemeB: string,  // IPA
 *   pairs: [string, string][],  // e.g. [['ship', 'sheep'], ['bit', 'beat']]
 *   tipFr: string,
 * }
 *
 * PHONEME_TIPS[ipaSymbol] = {
 *   label: string,      // human-readable name
 *   tipFr: string,      // French tip for producing this sound
 *   example: string,    // English example word
 *   commonError: string // Typical French speaker error
 * }
 */

// ---------------------------------------------------------------------------
// Seed data — a small set of items to make the app functional from day 1.
// The full 10-level corpus will be populated per the Part 2/3 spec.
// ---------------------------------------------------------------------------

export const CORPUS = {
  1: {
    name: 'Les bases',
    nameEn: 'The Basics',
    description: 'Mots du quotidien, sons fondamentaux',
    focus: ['θ', 'ð', 'æ', 'ʌ'],
    items: [
      {
        id: 'l1-001',
        type: 'word',
        text: 'the',
        ipa: '/ðə/',
        translation: 'le, la, les',
        difficulty: 1,
        focusPhonemes: ['ð'],
        tips: ['La langue touche les dents du haut', 'Son soufflé, pas explosif'],
      },
      {
        id: 'l1-002',
        type: 'word',
        text: 'think',
        ipa: '/θɪŋk/',
        translation: 'penser',
        difficulty: 2,
        focusPhonemes: ['θ'],
        tips: ['Langue entre les dents', 'Son soufflé non voisé'],
      },
      {
        id: 'l1-003',
        type: 'word',
        text: 'cat',
        ipa: '/kæt/',
        translation: 'chat',
        difficulty: 1,
        focusPhonemes: ['æ'],
        tips: ['Plus ouvert que le "a" français', 'Bouche très ouverte'],
      },
      {
        id: 'l1-004',
        type: 'word',
        text: 'cup',
        ipa: '/kʌp/',
        translation: 'tasse',
        difficulty: 2,
        focusPhonemes: ['ʌ'],
        tips: ['Voyelle centrale courte', 'Ni "a" ni "o", entre les deux'],
      },
      {
        id: 'l1-005',
        type: 'phrase',
        text: 'Hello, how are you?',
        ipa: '/həˈloʊ haʊ ɑːr juː/',
        translation: 'Bonjour, comment allez-vous ?',
        difficulty: 1,
        focusPhonemes: ['h', 'oʊ', 'juː'],
        tips: ['Le H est aspiré en anglais', 'Diphthongue OW dans "how"'],
      },
      {
        id: 'l1-006',
        type: 'phrase',
        text: 'Thank you very much.',
        ipa: '/θæŋk juː ˈvɛri mʌtʃ/',
        translation: 'Merci beaucoup.',
        difficulty: 2,
        focusPhonemes: ['θ', 'æ', 'ʌ'],
        tips: ['Commencez par θ dans "thank"', 'Distinguez /æ/ dans "thank" et /ʌ/ dans "much"'],
      },
    ],
  },

  2: {
    name: 'Sons vocaliques',
    nameEn: 'Vowel Sounds',
    description: 'Les voyelles anglaises difficiles pour les francophones',
    focus: ['iː', 'ɪ', 'uː', 'ʊ', 'ɛ', 'æ'],
    items: [
      {
        id: 'l2-001',
        type: 'word',
        text: 'ship',
        ipa: '/ʃɪp/',
        translation: 'bateau',
        difficulty: 2,
        focusPhonemes: ['ɪ'],
        tips: ['Court et relâché', 'Pas le même que "sheep"'],
      },
      {
        id: 'l2-002',
        type: 'word',
        text: 'sheep',
        ipa: '/ʃiːp/',
        translation: 'mouton',
        difficulty: 2,
        focusPhonemes: ['iː'],
        tips: ['Long et tendu', 'Lèvres étirées'],
      },
      {
        id: 'l2-003',
        type: 'word',
        text: 'pull',
        ipa: '/pʊl/',
        translation: 'tirer',
        difficulty: 3,
        focusPhonemes: ['ʊ'],
        tips: ['Court et relâché', 'Pas le même que "pool"'],
      },
      {
        id: 'l2-004',
        type: 'word',
        text: 'pool',
        ipa: '/puːl/',
        translation: 'piscine',
        difficulty: 3,
        focusPhonemes: ['uː'],
        tips: ['Long et arrondi', 'Lèvres très arrondies'],
      },
      {
        id: 'l2-005',
        type: 'sentence',
        text: 'The big ship is in the deep sea.',
        ipa: '/ðə bɪɡ ʃɪp ɪz ɪn ðə diːp siː/',
        translation: 'Le grand bateau est dans la mer profonde.',
        difficulty: 3,
        focusPhonemes: ['ɪ', 'iː'],
        tips: ['Distinguez bien ship/deep', 'big=court, deep=long'],
      },
    ],
  },

  3: {
    name: 'Consonnes délicates',
    nameEn: 'Tricky Consonants',
    description: 'TH, V/W, R anglais',
    focus: ['θ', 'ð', 'v', 'w', 'ɹ'],
    items: [
      {
        id: 'l3-001',
        type: 'word',
        text: 'very',
        ipa: '/ˈvɛri/',
        translation: 'très',
        difficulty: 2,
        focusPhonemes: ['v'],
        tips: ['Lèvre inférieure sur les dents du haut', 'V voisé, pas W'],
      },
      {
        id: 'l3-002',
        type: 'word',
        text: 'wine',
        ipa: '/waɪn/',
        translation: 'vin',
        difficulty: 2,
        focusPhonemes: ['w'],
        tips: ['Lèvres arrondies puis ouvertes', 'W n\'est pas V'],
      },
      {
        id: 'l3-003',
        type: 'word',
        text: 'right',
        ipa: '/ɹaɪt/',
        translation: 'droite / correct',
        difficulty: 3,
        focusPhonemes: ['ɹ'],
        tips: ['R rétroflexe, langue vers le haut', 'Jamais roulé comme en français'],
      },
    ],
  },

  4: {
    name: 'Phrases du quotidien',
    nameEn: 'Everyday Phrases',
    description: 'Expressions courantes de la vie quotidienne',
    focus: ['θ', 'ð', 'æ', 'ʌ', 'ɪ', 'v', 'w', 'ɹ'],
    items: [
      {
        id: 'l4-001',
        type: 'phrase',
        text: 'Excuse me, where is the nearest station?',
        ipa: '/ɪkˈskjuːz miː wɛr ɪz ðə ˈnɪərɪst ˈsteɪʃən/',
        translation: 'Excusez-moi, où est la station la plus proche ?',
        difficulty: 3,
        focusPhonemes: ['ð', 'ɹ', 'ɪ', 'w'],
        tips: ['W dans "where" : lèvres arrondies, pas de V', '/ð/ dans "the" — langue entre les dents, voix activée'],
      },
      {
        id: 'l4-002',
        type: 'phrase',
        text: 'Could you repeat that, please?',
        ipa: '/kʊd juː rɪˈpiːt ðæt pliːz/',
        translation: 'Pourriez-vous répéter cela, s\'il vous plaît ?',
        difficulty: 3,
        focusPhonemes: ['ð', 'ɹ', 'iː'],
        tips: ['/ð/ dans "that" — TH voisé, pas un D', 'R rétroflexe dans "repeat" — jamais roulé'],
      },
      {
        id: 'l4-003',
        type: 'phrase',
        text: 'I would like a cup of coffee, please.',
        ipa: '/aɪ wʊd laɪk ə kʌp əv ˈkɒfi pliːz/',
        translation: 'Je voudrais une tasse de café, s\'il vous plaît.',
        difficulty: 3,
        focusPhonemes: ['ʌ', 'v', 'w'],
        tips: ['/ʌ/ dans "cup" — voyelle centrale courte, ni A ni O', '/v/ dans "of" — lèvre inférieure sur les dents du haut'],
      },
      {
        id: 'l4-004',
        type: 'phrase',
        text: 'What time does the next train leave?',
        ipa: '/wɒt taɪm dʌz ðə nɛkst tɹeɪn liːv/',
        translation: 'À quelle heure part le prochain train ?',
        difficulty: 3,
        focusPhonemes: ['ð', 'w', 'ɹ'],
        tips: ['W dans "what" : lèvres arrondies puis qui s\'ouvrent', '/ð/ dans "the" — ne dites pas "de"'],
      },
      {
        id: 'l4-005',
        type: 'phrase',
        text: 'How much does this cost?',
        ipa: '/haʊ mʌtʃ dʌz ðɪs kɒst/',
        translation: 'Combien ça coûte ?',
        difficulty: 3,
        focusPhonemes: ['h', 'ʌ', 'ð'],
        tips: ['H aspiré dans "how" — ne l\'avalez pas comme en français', '/ʌ/ dans "much" — bouche mi-ouverte, langue au centre'],
      },
      {
        id: 'l4-006',
        type: 'sentence',
        text: 'I think this is a very good idea.',
        ipa: '/aɪ θɪŋk ðɪs ɪz ə ˈvɛri ɡʊd aɪˈdɪə/',
        translation: 'Je pense que c\'est une très bonne idée.',
        difficulty: 4,
        focusPhonemes: ['θ', 'ð', 'v', 'ɪ'],
        tips: ['θ dans "think" — TH sourd, langue entre les dents', '/ð/ dans "this" — même position mais avec voix', '/v/ dans "very" — pas un W'],
      },
      {
        id: 'l4-007',
        type: 'phrase',
        text: 'Would you like to come with us?',
        ipa: '/wʊd juː laɪk tə kʌm wɪð ʌs/',
        translation: 'Voudriez-vous venir avec nous ?',
        difficulty: 4,
        focusPhonemes: ['w', 'ð', 'ʌ'],
        tips: ['/w/ dans "would" et "with" — lèvres arrondies', '/ð/ dans "with" — TH voisé en fin de mot'],
      },
      {
        id: 'l4-008',
        type: 'sentence',
        text: 'The weather in England is rather unpredictable.',
        ipa: '/ðə ˈwɛðər ɪn ˈɪŋɡlənd ɪz ˈɹæðər ʌnprɪˈdɪktəbəl/',
        translation: 'La météo en Angleterre est plutôt imprévisible.',
        difficulty: 5,
        focusPhonemes: ['ð', 'w', 'ɹ', 'ʌ', 'ɪ'],
        tips: ['"weather" et "rather" contiennent /ðər/ — TH voisé + R rétroflexe', '/ʌ/ dans "unpredictable" — premier son de la phrase'],
      },
    ],
  },
  5: { name: 'Accentuation', nameEn: 'Word Stress', description: '', focus: [], items: [] },
  6: { name: 'Intonation', nameEn: 'Intonation', description: '', focus: [], items: [] },
  7: { name: 'Mots liés', nameEn: 'Connected Speech', description: '', focus: [], items: [] },
  8: { name: 'Réductions', nameEn: 'Reductions & Contractions', description: '', focus: [], items: [] },
  9: { name: 'Registres', nameEn: 'Formal vs Informal', description: '', focus: [], items: [] },
  10: { name: 'Maîtrise', nameEn: 'Mastery', description: '', focus: [], items: [] },
};

// ---------------------------------------------------------------------------
// Minimal pairs — for discriminating between commonly confused sounds
// ---------------------------------------------------------------------------

export const MINIMAL_PAIRS = [
  {
    id: 'mp-001',
    phonemeA: 'ɪ',
    phonemeB: 'iː',
    pairs: [
      ['ship', 'sheep'],
      ['bit', 'beat'],
      ['sit', 'seat'],
      ['live', 'leave'],
      ['fill', 'feel'],
    ],
    tipFr: 'Le son /ɪ/ est court et relâché, /iː/ est long et tendu avec les lèvres étirées.',
  },
  {
    id: 'mp-002',
    phonemeA: 'ʊ',
    phonemeB: 'uː',
    pairs: [
      ['pull', 'pool'],
      ['full', 'fool'],
      ['look', 'Luke'],
      ['good', 'food'],
    ],
    tipFr: '/ʊ/ est court et détendu, /uː/ est long avec les lèvres très arrondies.',
  },
  {
    id: 'mp-003',
    phonemeA: 'θ',
    phonemeB: 's',
    pairs: [
      ['think', 'sink'],
      ['three', 'sea'],
      ['thank', 'sank'],
      ['thin', 'sin'],
      ['mouth', 'mouse'],
    ],
    tipFr: '/θ/ se prononce langue entre les dents, /s/ avec la langue en arrière des dents du haut.',
  },
  {
    id: 'mp-004',
    phonemeA: 'ð',
    phonemeB: 'z',
    pairs: [
      ['this', 'zis'],
      ['there', 'zare'],
      ['though', 'zo'],
    ],
    tipFr: '/ð/ est le TH sonore (la, the, this) — langue entre les dents avec voix.',
  },
  {
    id: 'mp-005',
    phonemeA: 'v',
    phonemeB: 'w',
    pairs: [
      ['vine', 'wine'],
      ['vet', 'wet'],
      ['veil', 'wail'],
      ['vest', 'west'],
    ],
    tipFr: '/v/ : lèvre inférieure sur les dents du haut. /w/ : lèvres arrondies qui s\'ouvrent.',
  },
  {
    id: 'mp-006',
    phonemeA: 'æ',
    phonemeB: 'ɛ',
    pairs: [
      ['bad', 'bed'],
      ['sad', 'said'],
      ['hat', 'het'],
      ['man', 'men'],
      ['bag', 'beg'],
    ],
    tipFr: '/æ/ est plus ouvert que /ɛ/ — bouche plus grande, mâchoire plus basse.',
  },
];

// ---------------------------------------------------------------------------
// Phoneme tips — reference guide for individual IPA sounds
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Multiplayer phrases — sentences of increasing difficulty for French speakers
// Each "tier" is progressively harder (phonemes, length, connected speech)
// ---------------------------------------------------------------------------

export const MULTIPLAYER_PHRASES = [
  // Tier 1 — Short & basic (difficulty 1-2)
  { text: 'This is the thing.',                   difficulty: 1 },
  { text: 'I think it is good.',                  difficulty: 1 },
  { text: 'The cat sat on the hat.',              difficulty: 1 },
  { text: 'Where is the cup?',                    difficulty: 1 },
  { text: 'How are you today?',                   difficulty: 1 },
  { text: 'She has a red bag.',                    difficulty: 1 },
  { text: 'Thank you very much.',                 difficulty: 2 },
  { text: 'Would you like some water?',           difficulty: 2 },
  { text: 'He lives in a big house.',             difficulty: 2 },
  { text: 'What time is it right now?',           difficulty: 2 },

  // Tier 2 — TH + vowel contrasts (difficulty 3-4)
  { text: 'I thought those three things through.',             difficulty: 3 },
  { text: 'The weather was rather warm this Thursday.',        difficulty: 3 },
  { text: 'His brother and his father went there together.',   difficulty: 3 },
  { text: 'She ships cheap sheep sheets every week.',          difficulty: 3 },
  { text: 'Pull the wool over the pool fool.',                 difficulty: 4 },
  { text: 'The thin man thinks thick thoughts.',               difficulty: 4 },
  { text: 'Thirty-three thirsty thieves thought thoroughly.', difficulty: 4 },
  { text: 'He breathed through his teeth with ease.',          difficulty: 4 },
  { text: 'Which witch watched which watch?',                  difficulty: 4 },
  { text: 'Bad lads had glad dads in the sand.',               difficulty: 4 },

  // Tier 3 — V/W + R + connected speech (difficulty 5-6)
  { text: 'Very well, the vine and the wine are both fine.',                difficulty: 5 },
  { text: 'The world is a wonderful and weird place to explore.',           difficulty: 5 },
  { text: 'Rural breweries rarely brew regular red ales.',                  difficulty: 5 },
  { text: 'We were wary of the very heavy rain on Wednesday.',             difficulty: 6 },
  { text: 'Her third birthday party was on the first of February.',        difficulty: 6 },
  { text: 'The warrior worried whether the weather would worsen.',         difficulty: 6 },
  { text: 'Roger realized the railway ran through the rural area.',        difficulty: 6 },
  { text: 'Whoever reviews the work will rewrite the worst parts.',        difficulty: 6 },
  { text: 'Variety is the very spice of life, is it not?',                 difficulty: 5 },
  { text: 'Will you walk with us or wait in the van?',                     difficulty: 5 },

  // Tier 4 — Reductions, weak forms, stress (difficulty 7-8)
  { text: 'I could have gone to the store, but I would have been late.',             difficulty: 7 },
  { text: 'She should have told him that she was not going to be there.',             difficulty: 7 },
  { text: 'What do you think you are going to do about it?',                         difficulty: 7 },
  { text: 'He is not the kind of person who would have said something like that.',   difficulty: 7 },
  { text: 'The photograph and the photographer photographed the photography.',       difficulty: 8 },
  { text: 'An anonymous analysis of the analytical data was thoroughly examined.',    difficulty: 8 },
  { text: 'The comfortable temperature was comparable to a Mediterranean climate.',  difficulty: 8 },
  { text: 'Particularly, the parliamentary secretary was characteristically quiet.',  difficulty: 8 },
  { text: 'The entrepreneurs were enthusiastically entrepreneurial.',                difficulty: 8 },
  { text: 'A considerable percentage of the population participated voluntarily.',   difficulty: 8 },

  // Tier 5 — Tongue twisters & mastery (difficulty 9-10)
  { text: 'The sixth sick sheik\'s sixth sheep\'s sick.',                                          difficulty: 9 },
  { text: 'She sells seashells by the seashore and the shells she sells are seashells for sure.', difficulty: 9 },
  { text: 'How much wood would a woodchuck chuck if a woodchuck could chuck wood?',               difficulty: 9 },
  { text: 'Peter Piper picked a peck of pickled peppers.',                                         difficulty: 9 },
  { text: 'Red lorry, yellow lorry, red lorry, yellow lorry.',                                     difficulty: 9 },
  { text: 'Through three cheese trees, three free fleas flew.',                                    difficulty: 10 },
  { text: 'The thirty-three thieves thought that they thrilled the throne throughout Thursday.',   difficulty: 10 },
  { text: 'Whether the weather is warm, whether the weather is hot, we have to put up with the weather whether we like it or not.', difficulty: 10 },
  { text: 'Uniquely, the quinquennial queue for the boutique was quite picturesque.',              difficulty: 10 },
  { text: 'The epitome of hyperbole is not synonymous with catastrophe.',                          difficulty: 10 },
];

export const PHONEME_TIPS = {
  'θ': {
    label: 'TH sourd (think)',
    tipFr: 'Placez le bout de la langue entre les dents du haut et soufflez doucement. Son non voisé.',
    example: 'think, three, both',
    commonError: 'Remplacé par /s/ ou /t/ par les francophones',
  },
  'ð': {
    label: 'TH sonore (the)',
    tipFr: 'Comme /θ/ mais avec vibration des cordes vocales. Langue entre les dents, voix activée.',
    example: 'the, this, that, there',
    commonError: 'Remplacé par /z/ ou /d/ par les francophones',
  },
  'æ': {
    label: 'A ouvert (cat)',
    tipFr: 'Voyelle très ouverte entre /a/ et /ɛ/. Bouche très ouverte, mâchoire basse.',
    example: 'cat, bad, man, apple',
    commonError: 'Prononcé comme /a/ ou /ɛ/ — pas assez ouvert',
  },
  'ʌ': {
    label: 'A central (cup)',
    tipFr: 'Voyelle centrale courte. Bouche légèrement ouverte, langue au centre.',
    example: 'cup, but, love, blood',
    commonError: 'Confondu avec /a/ ou /ɔ/ par les francophones',
  },
  'ɪ': {
    label: 'I court (ship)',
    tipFr: 'Voyelle courte et détendue. Moins tendu que /i/ français.',
    example: 'ship, bit, sit, live',
    commonError: 'Prononcé trop long comme /iː/ français',
  },
  'iː': {
    label: 'I long (sheep)',
    tipFr: 'Voyelle longue et tendue. Lèvres étirées en sourire.',
    example: 'sheep, beat, sea, feel',
    commonError: 'Pas assez long ni tendu',
  },
  'ʊ': {
    label: 'OU court (pull)',
    tipFr: 'Voyelle courte et détendue. Lèvres légèrement arrondies.',
    example: 'pull, foot, look, good',
    commonError: 'Confondu avec /uː/ — trop long',
  },
  'uː': {
    label: 'OU long (pool)',
    tipFr: 'Voyelle longue. Lèvres très arrondies et projetées vers l\'avant.',
    example: 'pool, food, blue, moon',
    commonError: 'Pas assez long ni arrondi',
  },
  'ɹ': {
    label: 'R anglais (red)',
    tipFr: 'Langue relevée vers l\'arrière sans toucher le palais. Jamais roulé comme le R français.',
    example: 'red, right, three, very',
    commonError: 'Roulé à la française ou prononcé comme /w/',
  },
  'v': {
    label: 'V anglais (very)',
    tipFr: 'Lèvre inférieure légèrement sur les dents du haut. Son voisé.',
    example: 'very, vine, live, five',
    commonError: 'Confondu avec /w/ — "wine" prononcé "vine" ou vice-versa',
  },
  'w': {
    label: 'W (wine)',
    tipFr: 'Lèvres très arrondies puis qui s\'ouvrent rapidement. Jamais de contact dents-lèvre.',
    example: 'wine, water, when, queen',
    commonError: 'Prononcé comme /v/ — erreur très fréquente chez les francophones',
  },
  'h': {
    label: 'H aspiré (hello)',
    tipFr: 'Souffle d\'air depuis la gorge. En anglais le H est toujours prononcé (sauf exceptions).',
    example: 'hello, hat, house, who',
    commonError: 'H muet comme en français — non prononcé',
  },
  'ŋ': {
    label: 'NG (sing)',
    tipFr: 'Nasale vélaire — langue contre le voile du palais. Pas de /g/ final.',
    example: 'sing, ring, king, long',
    commonError: 'Ajout d\'un /g/ final : "sing-guh"',
  },
  'dʒ': {
    label: 'DG (judge)',
    tipFr: 'Consonne affriquée. Comme /d/ suivi de /ʒ/ rapidement.',
    example: 'judge, jump, bridge, age',
    commonError: 'Prononcé simplement comme /ʒ/ (je)',
  },
  'tʃ': {
    label: 'TCH (church)',
    tipFr: 'Consonne affriquée. Comme /t/ suivi de /ʃ/ rapidement.',
    example: 'church, teach, cheese, much',
    commonError: 'Prononcé comme /ʃ/ seul',
  },
  'eɪ': {
    label: 'Diphtongue AY (face)',
    tipFr: 'Commence sur /e/ et glisse vers /ɪ/. Ne pas prononcer simplement /e/.',
    example: 'face, day, name, make',
    commonError: 'Prononcé comme le /e/ français sans la glisse',
  },
  'oʊ': {
    label: 'Diphtongue OW (go)',
    tipFr: 'Commence sur /o/ et glisse vers /ʊ/. Ne pas prononcer simplement /o/.',
    example: 'go, home, phone, boat',
    commonError: 'Prononcé comme le /o/ français sans la glisse',
  },
  'aɪ': {
    label: 'Diphtongue AI (price)',
    tipFr: 'Commence sur /a/ ouvert et glisse vers /ɪ/.',
    example: 'price, time, like, my',
    commonError: 'Prononcé comme /aj/ français — acceptable mais peut sonner étranger',
  },
  'aʊ': {
    label: 'Diphtongue AOU (mouth)',
    tipFr: 'Commence sur /a/ ouvert et glisse vers /ʊ/.',
    example: 'mouth, now, house, out',
    commonError: 'Prononcé comme /ao/ avec deux syllabes',
  },
};
