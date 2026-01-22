/**
 * Multilingual NLP Keywords for Task Parsing
 *
 * This file contains localized keywords for NLP parsing of task metadata
 * including dates, priorities, and repeating patterns for all supported languages.
 *
 * Supported locales: en, de, fr, es, it, pt, nl, ru, ja, ko, zh-CN, zh-TW
 */

export type Locale = 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'nl' | 'ru' | 'ja' | 'ko' | 'zh-CN' | 'zh-TW'

export interface DateKeywords {
  today: string[]
  tomorrow: string[]
  nextWeek: string[]
  thisWeek: string[]
  monday: string[]
  tuesday: string[]
  wednesday: string[]
  thursday: string[]
  friday: string[]
  saturday: string[]
  sunday: string[]
}

export interface PriorityKeywords {
  highest: string[] // Priority 3
  high: string[] // Priority 2
  medium: string[] // Priority 1
  low: string[] // Priority 0
}

export interface RepeatingKeywords {
  daily: string[]
  weekly: string[]
  monthly: string[]
  yearly: string[]
  everyDay: string[]
  everyWeek: string[]
  everyMonth: string[]
  everyYear: string[]
}

export interface NLPKeywords {
  dates: DateKeywords
  priorities: PriorityKeywords
  repeating: RepeatingKeywords
}

export const nlpKeywords: Record<Locale, NLPKeywords> = {
  en: {
    dates: {
      today: ['today'],
      tomorrow: ['tomorrow'],
      nextWeek: ['next week'],
      thisWeek: ['this week'],
      monday: ['monday', 'mon'],
      tuesday: ['tuesday', 'tue'],
      wednesday: ['wednesday', 'wed'],
      thursday: ['thursday', 'thu'],
      friday: ['friday', 'fri'],
      saturday: ['saturday', 'sat'],
      sunday: ['sunday', 'sun'],
    },
    priorities: {
      highest: ['highest priority', 'urgent', 'asap'],
      high: ['high priority'],
      medium: ['medium priority'],
      low: ['low priority', 'lowest priority'],
    },
    repeating: {
      daily: ['daily'],
      weekly: ['weekly'],
      monthly: ['monthly'],
      yearly: ['yearly', 'annually'],
      everyDay: ['every day'],
      everyWeek: ['every week'],
      everyMonth: ['every month'],
      everyYear: ['every year'],
    },
  },
  de: {
    dates: {
      today: ['heute'],
      tomorrow: ['morgen'],
      nextWeek: ['nächste woche', 'naechste woche'],
      thisWeek: ['diese woche'],
      monday: ['montag', 'mo'],
      tuesday: ['dienstag', 'di'],
      wednesday: ['mittwoch', 'mi'],
      thursday: ['donnerstag', 'do'],
      friday: ['freitag', 'fr'],
      saturday: ['samstag', 'sa'],
      sunday: ['sonntag', 'so'],
    },
    priorities: {
      highest: ['höchste priorität', 'hoechste prioritaet', 'dringend'],
      high: ['hohe priorität', 'hohe prioritaet'],
      medium: ['mittlere priorität', 'mittlere prioritaet'],
      low: ['niedrige priorität', 'niedrige prioritaet'],
    },
    repeating: {
      daily: ['täglich', 'taeglich'],
      weekly: ['wöchentlich', 'woechentlich'],
      monthly: ['monatlich'],
      yearly: ['jährlich', 'jaehrlich'],
      everyDay: ['jeden tag'],
      everyWeek: ['jede woche'],
      everyMonth: ['jeden monat'],
      everyYear: ['jedes jahr'],
    },
  },
  fr: {
    dates: {
      today: ['aujourd\'hui', 'aujourdhui'],
      tomorrow: ['demain'],
      nextWeek: ['semaine prochaine'],
      thisWeek: ['cette semaine'],
      monday: ['lundi', 'lun'],
      tuesday: ['mardi', 'mar'],
      wednesday: ['mercredi', 'mer'],
      thursday: ['jeudi', 'jeu'],
      friday: ['vendredi', 'ven'],
      saturday: ['samedi', 'sam'],
      sunday: ['dimanche', 'dim'],
    },
    priorities: {
      highest: ['priorité maximale', 'priorite maximale', 'urgent', 'urgente'],
      high: ['haute priorité', 'haute priorite'],
      medium: ['priorité moyenne', 'priorite moyenne'],
      low: ['basse priorité', 'basse priorite'],
    },
    repeating: {
      daily: ['quotidien', 'quotidienne', 'journalier'],
      weekly: ['hebdomadaire'],
      monthly: ['mensuel', 'mensuelle'],
      yearly: ['annuel', 'annuelle'],
      everyDay: ['chaque jour', 'tous les jours'],
      everyWeek: ['chaque semaine'],
      everyMonth: ['chaque mois'],
      everyYear: ['chaque année', 'chaque annee'],
    },
  },
  es: {
    dates: {
      today: ['hoy'],
      tomorrow: ['mañana', 'manana'],
      nextWeek: ['próxima semana', 'proxima semana', 'semana próxima', 'semana proxima'],
      thisWeek: ['esta semana'],
      monday: ['lunes', 'lun'],
      tuesday: ['martes', 'mar'],
      wednesday: ['miércoles', 'miercoles', 'mié', 'mie'],
      thursday: ['jueves', 'jue'],
      friday: ['viernes', 'vie'],
      saturday: ['sábado', 'sabado', 'sáb', 'sab'],
      sunday: ['domingo', 'dom'],
    },
    priorities: {
      highest: ['prioridad máxima', 'prioridad maxima', 'urgente'],
      high: ['alta prioridad', 'prioridad alta'],
      medium: ['prioridad media'],
      low: ['baja prioridad', 'prioridad baja'],
    },
    repeating: {
      daily: ['diario', 'diaria', 'diariamente'],
      weekly: ['semanal', 'semanalmente'],
      monthly: ['mensual', 'mensualmente'],
      yearly: ['anual', 'anualmente'],
      everyDay: ['cada día', 'cada dia', 'todos los días', 'todos los dias'],
      everyWeek: ['cada semana'],
      everyMonth: ['cada mes'],
      everyYear: ['cada año', 'cada ano'],
    },
  },
  it: {
    dates: {
      today: ['oggi'],
      tomorrow: ['domani'],
      nextWeek: ['settimana prossima', 'prossima settimana'],
      thisWeek: ['questa settimana'],
      monday: ['lunedì', 'lunedi', 'lun'],
      tuesday: ['martedì', 'martedi', 'mar'],
      wednesday: ['mercoledì', 'mercoledi', 'mer'],
      thursday: ['giovedì', 'giovedi', 'gio'],
      friday: ['venerdì', 'venerdi', 'ven'],
      saturday: ['sabato', 'sab'],
      sunday: ['domenica', 'dom'],
    },
    priorities: {
      highest: ['massima priorità', 'massima priorita', 'urgente'],
      high: ['alta priorità', 'alta priorita'],
      medium: ['priorità media', 'priorita media'],
      low: ['bassa priorità', 'bassa priorita'],
    },
    repeating: {
      daily: ['giornaliero', 'giornaliera', 'quotidiano'],
      weekly: ['settimanale'],
      monthly: ['mensile'],
      yearly: ['annuale'],
      everyDay: ['ogni giorno'],
      everyWeek: ['ogni settimana'],
      everyMonth: ['ogni mese'],
      everyYear: ['ogni anno'],
    },
  },
  pt: {
    dates: {
      today: ['hoje'],
      tomorrow: ['amanhã', 'amanha'],
      nextWeek: ['próxima semana', 'proxima semana', 'semana que vem'],
      thisWeek: ['esta semana'],
      monday: ['segunda-feira', 'segunda', 'seg'],
      tuesday: ['terça-feira', 'terca-feira', 'terça', 'terca', 'ter'],
      wednesday: ['quarta-feira', 'quarta', 'qua'],
      thursday: ['quinta-feira', 'quinta', 'qui'],
      friday: ['sexta-feira', 'sexta', 'sex'],
      saturday: ['sábado', 'sabado', 'sáb', 'sab'],
      sunday: ['domingo', 'dom'],
    },
    priorities: {
      highest: ['prioridade máxima', 'prioridade maxima', 'urgente'],
      high: ['alta prioridade', 'prioridade alta'],
      medium: ['prioridade média', 'prioridade media'],
      low: ['baixa prioridade', 'prioridade baixa'],
    },
    repeating: {
      daily: ['diário', 'diario', 'diária', 'diaria'],
      weekly: ['semanal'],
      monthly: ['mensal'],
      yearly: ['anual'],
      everyDay: ['todo dia', 'todos os dias'],
      everyWeek: ['toda semana'],
      everyMonth: ['todo mês', 'todo mes'],
      everyYear: ['todo ano'],
    },
  },
  nl: {
    dates: {
      today: ['vandaag'],
      tomorrow: ['morgen'],
      nextWeek: ['volgende week'],
      thisWeek: ['deze week'],
      monday: ['maandag', 'ma'],
      tuesday: ['dinsdag', 'di'],
      wednesday: ['woensdag', 'wo'],
      thursday: ['donderdag', 'do'],
      friday: ['vrijdag', 'vr'],
      saturday: ['zaterdag', 'za'],
      sunday: ['zondag', 'zo'],
    },
    priorities: {
      highest: ['hoogste prioriteit', 'urgent', 'dringend'],
      high: ['hoge prioriteit'],
      medium: ['gemiddelde prioriteit', 'normale prioriteit'],
      low: ['lage prioriteit', 'laagste prioriteit'],
    },
    repeating: {
      daily: ['dagelijks'],
      weekly: ['wekelijks'],
      monthly: ['maandelijks'],
      yearly: ['jaarlijks'],
      everyDay: ['elke dag', 'iedere dag'],
      everyWeek: ['elke week', 'iedere week'],
      everyMonth: ['elke maand', 'iedere maand'],
      everyYear: ['elk jaar', 'ieder jaar'],
    },
  },
  ru: {
    dates: {
      today: ['сегодня'],
      tomorrow: ['завтра'],
      nextWeek: ['следующая неделя', 'следующей неделе'],
      thisWeek: ['эта неделя', 'этой неделе'],
      monday: ['понедельник', 'пн'],
      tuesday: ['вторник', 'вт'],
      wednesday: ['среда', 'ср'],
      thursday: ['четверг', 'чт'],
      friday: ['пятница', 'пт'],
      saturday: ['суббота', 'сб'],
      sunday: ['воскресенье', 'вс'],
    },
    priorities: {
      highest: ['наивысший приоритет', 'срочно', 'немедленно'],
      high: ['высокий приоритет'],
      medium: ['средний приоритет'],
      low: ['низкий приоритет'],
    },
    repeating: {
      daily: ['ежедневно', 'каждый день'],
      weekly: ['еженедельно', 'каждую неделю'],
      monthly: ['ежемесячно', 'каждый месяц'],
      yearly: ['ежегодно', 'каждый год'],
      everyDay: ['каждый день'],
      everyWeek: ['каждую неделю'],
      everyMonth: ['каждый месяц'],
      everyYear: ['каждый год'],
    },
  },
  ja: {
    dates: {
      today: ['今日', 'きょう'],
      tomorrow: ['明日', 'あした', 'あす'],
      nextWeek: ['来週', 'らいしゅう'],
      thisWeek: ['今週', 'こんしゅう'],
      monday: ['月曜日', '月曜', 'げつようび', '月'],
      tuesday: ['火曜日', '火曜', 'かようび', '火'],
      wednesday: ['水曜日', '水曜', 'すいようび', '水'],
      thursday: ['木曜日', '木曜', 'もくようび', '木'],
      friday: ['金曜日', '金曜', 'きんようび', '金'],
      saturday: ['土曜日', '土曜', 'どようび', '土'],
      sunday: ['日曜日', '日曜', 'にちようび', '日'],
    },
    priorities: {
      highest: ['最優先', '最高優先度', '緊急', '至急'],
      high: ['高優先度', '優先度高'],
      medium: ['中優先度', '優先度中'],
      low: ['低優先度', '優先度低'],
    },
    repeating: {
      daily: ['毎日', 'まいにち'],
      weekly: ['毎週', 'まいしゅう'],
      monthly: ['毎月', 'まいつき'],
      yearly: ['毎年', 'まいとし'],
      everyDay: ['毎日'],
      everyWeek: ['毎週'],
      everyMonth: ['毎月'],
      everyYear: ['毎年'],
    },
  },
  ko: {
    dates: {
      today: ['오늘'],
      tomorrow: ['내일'],
      nextWeek: ['다음 주', '다음주'],
      thisWeek: ['이번 주', '이번주'],
      monday: ['월요일', '월'],
      tuesday: ['화요일', '화'],
      wednesday: ['수요일', '수'],
      thursday: ['목요일', '목'],
      friday: ['금요일', '금'],
      saturday: ['토요일', '토'],
      sunday: ['일요일', '일'],
    },
    priorities: {
      highest: ['최우선', '최고 우선순위', '긴급'],
      high: ['높은 우선순위', '높음'],
      medium: ['보통 우선순위', '보통'],
      low: ['낮은 우선순위', '낮음'],
    },
    repeating: {
      daily: ['매일'],
      weekly: ['매주'],
      monthly: ['매달', '매월'],
      yearly: ['매년'],
      everyDay: ['매일', '매일마다'],
      everyWeek: ['매주', '매주마다'],
      everyMonth: ['매달', '매달마다', '매월'],
      everyYear: ['매년', '매년마다'],
    },
  },
  'zh-CN': {
    dates: {
      today: ['今天', '今日'],
      tomorrow: ['明天', '明日'],
      nextWeek: ['下周', '下星期', '下週'],
      thisWeek: ['本周', '这周', '本星期', '這週'],
      monday: ['星期一', '周一', '礼拜一', '週一'],
      tuesday: ['星期二', '周二', '礼拜二', '週二'],
      wednesday: ['星期三', '周三', '礼拜三', '週三'],
      thursday: ['星期四', '周四', '礼拜四', '週四'],
      friday: ['星期五', '周五', '礼拜五', '週五'],
      saturday: ['星期六', '周六', '礼拜六', '週六'],
      sunday: ['星期日', '星期天', '周日', '周天', '礼拜日', '礼拜天', '週日'],
    },
    priorities: {
      highest: ['最高优先级', '最高優先級', '紧急', '緊急'],
      high: ['高优先级', '高優先級', '优先级高'],
      medium: ['中等优先级', '中等優先級', '优先级中'],
      low: ['低优先级', '低優先級', '优先级低'],
    },
    repeating: {
      daily: ['每天', '每日'],
      weekly: ['每周', '每週'],
      monthly: ['每月'],
      yearly: ['每年'],
      everyDay: ['每天', '每日'],
      everyWeek: ['每周', '每週', '每星期'],
      everyMonth: ['每月', '每个月'],
      everyYear: ['每年'],
    },
  },
  'zh-TW': {
    dates: {
      today: ['今天', '今日'],
      tomorrow: ['明天', '明日'],
      nextWeek: ['下週', '下星期', '下周'],
      thisWeek: ['本週', '這週', '本星期', '这周'],
      monday: ['星期一', '週一', '禮拜一', '周一'],
      tuesday: ['星期二', '週二', '禮拜二', '周二'],
      wednesday: ['星期三', '週三', '禮拜三', '周三'],
      thursday: ['星期四', '週四', '禮拜四', '周四'],
      friday: ['星期五', '週五', '禮拜五', '周五'],
      saturday: ['星期六', '週六', '禮拜六', '周六'],
      sunday: ['星期日', '星期天', '週日', '週天', '禮拜日', '禮拜天', '周日'],
    },
    priorities: {
      highest: ['最高優先級', '最高优先级', '緊急', '紧急'],
      high: ['高優先級', '高优先级', '優先級高'],
      medium: ['中等優先級', '中等优先级', '優先級中'],
      low: ['低優先級', '低优先级', '優先級低'],
    },
    repeating: {
      daily: ['每天', '每日'],
      weekly: ['每週', '每周'],
      monthly: ['每月'],
      yearly: ['每年'],
      everyDay: ['每天', '每日'],
      everyWeek: ['每週', '每周', '每星期'],
      everyMonth: ['每月', '每個月'],
      everyYear: ['每年'],
    },
  },
}

/**
 * Get NLP keywords for a specific locale
 * Falls back to English if locale is not found
 */
export function getNLPKeywords(locale: string): NLPKeywords {
  const normalizedLocale = locale.toLowerCase()

  // Build a case-insensitive lookup map
  const localeKeys = Object.keys(nlpKeywords) as Locale[]
  const localeMap = new Map<string, Locale>()
  for (const key of localeKeys) {
    localeMap.set(key.toLowerCase(), key)
  }

  // Direct match (case-insensitive)
  if (localeMap.has(normalizedLocale)) {
    return nlpKeywords[localeMap.get(normalizedLocale)!]
  }

  // Try language code without region (e.g., 'en' from 'en-US')
  const languageCode = normalizedLocale.split('-')[0]
  if (localeMap.has(languageCode)) {
    return nlpKeywords[localeMap.get(languageCode)!]
  }

  // Default to English
  return nlpKeywords.en
}
