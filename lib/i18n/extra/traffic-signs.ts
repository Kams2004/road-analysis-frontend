/**
 * Traffic-sign codes (two-stage sign pipeline): the built-in VIASafe sign
 * taxonomy (used when GET /models/signs/taxonomy is unavailable), the
 * localized sign names and `signLabel(code, lang)`, plus the UI strings of
 * the sign picker / per-class thresholds ("sign.*" keys).
 *
 * A detection of type "traffic_sign" carries a sign code as its subtype
 * (e.g. "speed_limit_50", "stop", "traffic_light", "unknown_sign"). Codes not
 * listed here are humanized ("no_entry" → "No entry", "speed_limit_70" →
 * "Speed limit 70 km/h").
 */

type L3 = "en" | "fr" | "es"

export interface SignFamily { code: string; name_en: string; name_fr: string }
export interface SignClass { code: string; name_en: string; name_fr: string; family: string }
export interface SignTaxonomy {
  taxonomy_version: string | null
  source: "file" | "card" | "builtin"
  families: SignFamily[]
  classes: SignClass[]
}

export const SIGN_FAMILIES: SignFamily[] = [
  { code: "priority", name_en: "Priority", name_fr: "Priorité" },
  { code: "prohibition", name_en: "Prohibition", name_fr: "Interdiction" },
  { code: "speed_limit", name_en: "Speed limits", name_fr: "Limitations de vitesse" },
  { code: "mandatory", name_en: "Mandatory", name_fr: "Obligation" },
  { code: "warning", name_en: "Warning", name_fr: "Danger" },
  { code: "information", name_en: "Information", name_fr: "Indication" },
  { code: "signals", name_en: "Traffic signals", name_fr: "Signaux lumineux" },
  { code: "other", name_en: "Other", name_fr: "Autre" },
]

// [code, family, English, French]
const RAW: [string, string, string, string][] = [
  ["stop", "priority", "Stop", "Stop"],
  ["give_way", "priority", "Give way", "Cédez le passage"],
  ["priority_road", "priority", "Priority road", "Route prioritaire"],
  ["end_priority_road", "priority", "End of priority road", "Fin de route prioritaire"],

  ["no_entry", "prohibition", "No entry", "Sens interdit"],
  ["no_vehicles", "prohibition", "No vehicles", "Circulation interdite"],
  ["no_overtaking", "prohibition", "No overtaking", "Interdiction de dépasser"],
  ["no_parking", "prohibition", "No parking", "Stationnement interdit"],
  ["no_stopping", "prohibition", "No stopping", "Arrêt et stationnement interdits"],
  ["no_left_turn", "prohibition", "No left turn", "Interdiction de tourner à gauche"],
  ["no_right_turn", "prohibition", "No right turn", "Interdiction de tourner à droite"],
  ["no_u_turn", "prohibition", "No U-turn", "Demi-tour interdit"],
  ["no_trucks", "prohibition", "No trucks", "Accès interdit aux poids lourds"],
  ["no_horn", "prohibition", "No horn", "Signaux sonores interdits"],
  ["end_prohibition", "prohibition", "End of all prohibitions", "Fin de toutes les interdictions"],

  ...[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130].map(
    (n) => [`speed_limit_${n}`, "speed_limit", `Speed limit ${n} km/h`, `Limitation ${n} km/h`] as [string, string, string, string],
  ),
  ["end_speed_limit", "speed_limit", "End of speed limit", "Fin de limitation de vitesse"],

  ["keep_right", "mandatory", "Keep right", "Contournement par la droite"],
  ["keep_left", "mandatory", "Keep left", "Contournement par la gauche"],
  ["turn_right_ahead", "mandatory", "Turn right ahead", "Obligation de tourner à droite"],
  ["turn_left_ahead", "mandatory", "Turn left ahead", "Obligation de tourner à gauche"],
  ["ahead_only", "mandatory", "Ahead only", "Direction obligatoire tout droit"],
  ["roundabout_mandatory", "mandatory", "Roundabout", "Carrefour giratoire obligatoire"],

  ["general_danger", "warning", "General danger", "Autres dangers"],
  ["pedestrians", "warning", "Pedestrians", "Passage de piétons"],
  ["children", "warning", "Children", "Enfants"],
  ["curve_left", "warning", "Curve to the left", "Virage à gauche"],
  ["curve_right", "warning", "Curve to the right", "Virage à droite"],
  ["double_bend", "warning", "Double bend", "Succession de virages"],
  ["left_hairpin_curve", "warning", "Hairpin bend to the left", "Virage en épingle à gauche"],
  ["road_works", "warning", "Road works", "Travaux"],
  ["men_at_work", "warning", "Men at work", "Travaux (ouvriers)"],
  ["slippery_road", "warning", "Slippery road", "Chaussée glissante"],
  ["falling_rocks", "warning", "Falling rocks", "Chutes de pierres"],
  ["narrow_road", "warning", "Road narrows", "Chaussée rétrécie"],
  ["narrow_bridge", "warning", "Narrow bridge", "Pont étroit"],
  ["speed_bump", "warning", "Speed bump", "Ralentisseur"],
  ["uneven_road", "warning", "Uneven road", "Chaussée déformée"],
  ["crossroads", "warning", "Crossroads", "Intersection"],
  ["roundabout_ahead", "warning", "Roundabout ahead", "Carrefour giratoire"],
  ["traffic_signals_ahead", "warning", "Traffic signals ahead", "Feux tricolores"],
  ["animals", "warning", "Animals", "Passage d'animaux"],
  ["steep_descent", "warning", "Steep descent", "Descente dangereuse"],
  ["steep_ascent", "warning", "Steep ascent", "Montée à forte pente"],
  ["two_way_traffic", "warning", "Two-way traffic", "Circulation à double sens"],
  ["level_crossing", "warning", "Level crossing", "Passage à niveau"],

  ["pedestrian_crossing", "information", "Pedestrian crossing", "Passage pour piétons"],
  ["parking", "information", "Parking", "Parking"],
  ["one_way", "information", "One way", "Sens unique"],
  ["dead_end", "information", "Dead end", "Impasse"],
  ["hospital", "information", "Hospital", "Hôpital"],
  ["bus_stop", "information", "Bus stop", "Arrêt de bus"],

  ["traffic_light", "signals", "Traffic light", "Feu tricolore"],

  ["unknown_sign", "other", "Unknown sign", "Panneau non identifié"],
]

/** Built-in taxonomy (fallback for the Correct dialog). */
export const BUILTIN_SIGN_CLASSES: SignClass[] = RAW.map(([code, family, name_en, name_fr]) => ({ code, family, name_en, name_fr }))

export const BUILTIN_SIGN_TAXONOMY: SignTaxonomy = {
  taxonomy_version: null,
  source: "builtin",
  families: SIGN_FAMILIES,
  classes: BUILTIN_SIGN_CLASSES,
}

// Generic subtypes of the old console / legacy model: labels only (not offered in the picker).
const LEGACY: Record<string, [string, string]> = {
  speed_limit: ["Speed limit", "Limitation de vitesse"],
  yield: ["Give way", "Cédez le passage"],
  warning: ["Warning sign", "Panneau de danger"],
  direction: ["Direction sign", "Panneau de direction"],
  other: ["Other sign", "Autre panneau"],
  not_a_sign: ["Not a sign", "Pas un panneau"],
}

const NAMES = new Map<string, [string, string]>([
  ...Object.entries(LEGACY),
  ...RAW.map(([code, , en, fr]) => [code, [en, fr]] as [string, [string, string]]),
])

/** Merge the names served by GET /models/signs/taxonomy (they win over the built-in ones). */
export function registerSignNames(classes: SignClass[]) {
  for (const c of classes) if (c.code && (c.name_en || c.name_fr)) NAMES.set(c.code, [c.name_en || c.name_fr, c.name_fr || c.name_en])
}

/** "speed_limit_50" → "Speed limit 50 km/h"; "no_entry" → "No entry". */
export function humanizeSign(code: string, lang: L3 | string = "en"): string {
  const m = /^speed_limit_(\d+)$/.exec(code)
  if (m) return lang === "fr" ? `Limitation ${m[1]} km/h` : lang === "es" ? `Límite ${m[1]} km/h` : `Speed limit ${m[1]} km/h`
  const s = code.replace(/_/g, " ").trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : code
}

/** Localized name of a sign code (French, else English), humanized when unknown. */
export function signLabel(code: string | null | undefined, lang: L3 | string = "en"): string {
  if (!code) return ""
  const n = NAMES.get(code)
  if (n) return lang === "fr" ? n[1] : n[0]
  return humanizeSign(code, lang)
}

/** Localized name of a sign family. */
export function signFamilyLabel(f: Pick<SignFamily, "code" | "name_en" | "name_fr"> | undefined, code: string, lang: L3 | string = "en"): string {
  if (f) return (lang === "fr" ? f.name_fr : f.name_en) || f.name_en || code
  return humanizeSign(code, lang)
}

export const en: Record<string, string> = {
  "ai.card.rejectClass": "Reject class",
  "rej.code.ai_not_a_sign": "Not a traffic sign",
  "ai.reason.not_static": "Moving / seen once",
  "ai.reason.off_road_area": "Above road area",
  "ai.reason.ai_off_road": "Off the road area",
  "ai.reason.ai_box_too_large": "Box too large / roadside",
  "ai.set.guards": "Safety checks before an automatic acceptance",
  "ai.set.minFrames": "Minimum consecutive frames",
  "ai.set.minFramesHint": "A detection is auto-accepted only if the same object is seen in at least this many consecutive analysed frames. Objects seen once (a passing sticker, a bird, a flash) go to human review.",
  "ai.set.maxDrift": "Maximum position drift (m)",
  "ai.set.maxDriftHint": "Real signs and potholes don't move. If an object's estimated position moves more than this many metres while the vehicle drives (sticker on a truck, motorcycle, pedestrian), it is not auto-accepted and goes to review.",
  "ai.set.potholeY": "Pothole road-area line",
  "ai.set.potholeYHint": "Potholes must be on the road surface, in the lower part of the image. A pothole whose box centre is above this line (0 = top of the image, 1 = bottom) is never auto-accepted: it is rejected automatically or sent to review (see the setting below).",
  "ai.set.potholeYAbove": "not auto-accepted",
  "ai.set.potholeYBelow": "road area",
  "ai.set.err.minFrames": "Enter a whole number of at least 1.",
  "ai.set.err.drift": "Enter a distance greater than 0.",
  "ai.set.err.ratio": "Enter a value between 0 and 1.",
  "ai.set.potholeOffRoad": "Pothole above the road-area line",
  "ai.set.potholeOffRoadHint": "What happens to a pothole whose box centre is above the road-area line (trees, sky, roadside): rejected automatically (assisted / automatic mode, reason \"Off the road area\") or only kept out of auto-accept and sent to review. In manual mode it is always a hint for the reviewer.",
  "ai.set.potholeOffRoad.reject": "Reject automatically",
  "ai.set.potholeOffRoad.review": "Send to review",
  "ai.set.potholeMaxWidth": "Maximum pothole box width",
  "ai.set.potholeMaxWidthHint": "Share of the image width (0.40 = 40 %). A wider box is rejected automatically as \"Box too large / roadside\" (assisted / automatic mode; hint only in manual mode). 1 = off.",
  "ai.set.potholeMaxArea": "Maximum pothole box area",
  "ai.set.potholeMaxAreaHint": "Share of the image area (0.12 = 12 %). A larger box (roadside earth, bushes, building edge) is rejected automatically as \"Box too large / roadside\". 1 = off.",
  "ai.set.potholeEdge": "Reject wide boxes touching the image side",
  "ai.set.potholeEdgeHint": "A box touching the left or right border of the image (within 1 %) and wider than 25 % of it is roadside, not a pothole: rejected automatically as \"Box too large / roadside\" (hint only in manual mode).",
  "ai.set.potholeRulesNote": "Pothole false-positive rules — automatic rejections apply in assisted and automatic mode only; in manual mode they are shown to the reviewer as AI suggestions.",
  "sign.picker.label": "Sign",
  "sign.picker.search": "Search a sign…",
  "sign.picker.candidates": "Classifier suggestions",
  "sign.picker.none": "No sign matches this search.",
  "sign.picker.loading": "Loading the sign list…",
  "sign.picker.builtin": "Built-in sign list (the server's taxonomy is unavailable).",
  "sign.picker.selected": "Selected: {name}",
  "sign.candidates": "Classifier top 3",
  "ai.slot.signs_classifier": "Traffic-sign classifier (sign codes)",
  "ai.models.missingClassifier.signs": "No sign classifier installed: traffic signs use the single-stage (legacy) pipeline.",
  "ai.pipeline.two_stage": "Two-stage (detector + classifier)",
  "ai.pipeline.single_stage": "Single-stage (legacy)",
  "ai.card.taxonomy": "Taxonomy",
  "ai.card.cropPad": "Crop padding",
  "ai.perClass.title": "Per-class thresholds and metrics",
  "ai.perClass.code": "Sign",
  "ai.perClass.cardAccept": "Card accept",
  "ai.perClass.cardReject": "Card reject",
  "ai.perClass.effAccept": "Effective accept",
  "ai.perClass.effReject": "Effective reject",
  "ai.perClass.empty": "The model card has no per-class thresholds or metrics.",
  "ai.src.card_global": "model card (global)",
  "ai.src.global": "type threshold",
  "ai.set.perClass": "Per-class thresholds — traffic signs",
  "ai.set.perClassHint": "Verifier thresholds for one sign code. Leave empty to follow the model card's per-class value, then the type thresholds above.",
  "ai.set.perClassEmpty": "The sign classifier's card has no per-class thresholds.",
}

export const fr: Record<string, string> = {
  "ai.card.rejectClass": "Classe de rejet",
  "rej.code.ai_not_a_sign": "Pas un panneau de signalisation",
  "ai.reason.not_static": "En mouvement / vu une fois",
  "ai.reason.off_road_area": "Au-dessus de la chaussée",
  "ai.reason.ai_off_road": "Hors chaussée",
  "ai.reason.ai_box_too_large": "Cadre trop grand / bas-côté",
  "ai.set.guards": "Contrôles avant une acceptation automatique",
  "ai.set.minFrames": "Images consécutives minimum",
  "ai.set.minFramesHint": "Une détection n'est acceptée automatiquement que si le même objet est vu sur au moins ce nombre d'images analysées consécutives. Les objets vus une seule fois (autocollant qui passe, oiseau, reflet) vont en revue humaine.",
  "ai.set.maxDrift": "Dérive de position maximale (m)",
  "ai.set.maxDriftHint": "Les vrais panneaux et nids-de-poule ne bougent pas. Si la position estimée d'un objet se déplace de plus de ce nombre de mètres pendant que le véhicule roule (autocollant sur un camion, moto, piéton), il n'est pas accepté automatiquement et passe en revue.",
  "ai.set.potholeY": "Ligne de la chaussée (nids-de-poule)",
  "ai.set.potholeYHint": "Les nids-de-poule doivent être sur la chaussée, dans la partie basse de l'image. Un nid-de-poule dont le centre du cadre est au-dessus de cette ligne (0 = haut de l'image, 1 = bas) n'est jamais accepté automatiquement : il est rejeté automatiquement ou passe en revue (voir le réglage ci-dessous).",
  "ai.set.potholeYAbove": "pas d'acceptation auto",
  "ai.set.potholeYBelow": "chaussée",
  "ai.set.err.minFrames": "Saisir un nombre entier d'au moins 1.",
  "ai.set.err.drift": "Saisir une distance supérieure à 0.",
  "ai.set.err.ratio": "Saisir une valeur entre 0 et 1.",
  "ai.set.potholeOffRoad": "Nid-de-poule au-dessus de la ligne de chaussée",
  "ai.set.potholeOffRoadHint": "Que faire d'un nid-de-poule dont le centre du cadre est au-dessus de la ligne de chaussée (arbres, ciel, bas-côté) : rejet automatique (mode assisté / automatique, motif « Hors chaussée ») ou seulement pas d'acceptation auto et passage en revue. En mode manuel c'est toujours une indication pour le validateur.",
  "ai.set.potholeOffRoad.reject": "Rejeter automatiquement",
  "ai.set.potholeOffRoad.review": "Envoyer en revue",
  "ai.set.potholeMaxWidth": "Largeur maximale du cadre",
  "ai.set.potholeMaxWidthHint": "Part de la largeur de l'image (0,40 = 40 %). Un cadre plus large est rejeté automatiquement « Cadre trop grand / bas-côté » (mode assisté / automatique ; simple indication en mode manuel). 1 = désactivé.",
  "ai.set.potholeMaxArea": "Surface maximale du cadre",
  "ai.set.potholeMaxAreaHint": "Part de la surface de l'image (0,12 = 12 %). Un cadre plus grand (terre rouge du bas-côté, buissons, bord de bâtiment) est rejeté automatiquement « Cadre trop grand / bas-côté ». 1 = désactivé.",
  "ai.set.potholeEdge": "Rejeter les cadres larges qui touchent le bord de l'image",
  "ai.set.potholeEdgeHint": "Un cadre qui touche le bord gauche ou droit de l'image (à 1 % près) et plus large que 25 % de celle-ci est le bas-côté, pas un nid-de-poule : rejet automatique « Cadre trop grand / bas-côté » (simple indication en mode manuel).",
  "ai.set.potholeRulesNote": "Règles anti-faux positifs des nids-de-poule — les rejets automatiques s'appliquent en mode assisté et automatique uniquement ; en mode manuel ils sont proposés au validateur comme suggestions de l'IA.",
  "sign.picker.label": "Panneau",
  "sign.picker.search": "Rechercher un panneau…",
  "sign.picker.candidates": "Suggestions du classifieur",
  "sign.picker.none": "Aucun panneau ne correspond à cette recherche.",
  "sign.picker.loading": "Chargement de la liste des panneaux…",
  "sign.picker.builtin": "Liste de panneaux intégrée (la taxonomie du serveur est indisponible).",
  "sign.picker.selected": "Sélection : {name}",
  "sign.candidates": "Top 3 du classifieur",
  "ai.slot.signs_classifier": "Classifieur de panneaux (codes)",
  "ai.models.missingClassifier.signs": "Aucun classifieur de panneaux installé : les panneaux passent par le pipeline à une étape (ancien).",
  "ai.pipeline.two_stage": "Deux étapes (détecteur + classifieur)",
  "ai.pipeline.single_stage": "Une étape (ancien)",
  "ai.card.taxonomy": "Taxonomie",
  "ai.card.cropPad": "Marge de découpe",
  "ai.perClass.title": "Seuils et métriques par classe",
  "ai.perClass.code": "Panneau",
  "ai.perClass.cardAccept": "Acceptation (fiche)",
  "ai.perClass.cardReject": "Rejet (fiche)",
  "ai.perClass.effAccept": "Acceptation appliquée",
  "ai.perClass.effReject": "Rejet appliqué",
  "ai.perClass.empty": "La fiche du modèle n'a ni seuils ni métriques par classe.",
  "ai.src.card_global": "fiche du modèle (global)",
  "ai.src.global": "seuil du type",
  "ai.set.perClass": "Seuils par classe — panneaux",
  "ai.set.perClassHint": "Seuils du vérificateur pour un code de panneau. Laisser vide pour suivre la valeur par classe de la fiche, puis les seuils du type ci-dessus.",
  "ai.set.perClassEmpty": "La fiche du classifieur de panneaux n'a pas de seuils par classe.",
}

export const es: Record<string, string> = {
  "ai.card.rejectClass": "Clase de rechazo",
  "rej.code.ai_not_a_sign": "No es una señal de tráfico",
  "ai.reason.not_static": "En movimiento / vista una vez",
  "ai.reason.off_road_area": "Encima de la calzada",
  "ai.reason.ai_off_road": "Fuera de la calzada",
  "ai.reason.ai_box_too_large": "Recuadro demasiado grande / arcén",
  "ai.set.guards": "Controles antes de una aceptación automática",
  "ai.set.minFrames": "Fotogramas consecutivos mínimos",
  "ai.set.minFramesHint": "Una detección solo se acepta automáticamente si el mismo objeto se ve en al menos este número de fotogramas analizados consecutivos. Los objetos vistos una sola vez van a revisión humana.",
  "ai.set.maxDrift": "Deriva de posición máxima (m)",
  "ai.set.maxDriftHint": "Las señales y baches reales no se mueven. Si la posición estimada de un objeto se desplaza más de estos metros mientras el vehículo avanza, no se acepta automáticamente y pasa a revisión.",
  "ai.set.potholeY": "Línea de la calzada (baches)",
  "ai.set.potholeYHint": "Los baches deben estar en la calzada, en la parte baja de la imagen. Un bache cuyo centro está por encima de esta línea (0 = arriba, 1 = abajo) nunca se acepta automáticamente: se rechaza automáticamente o pasa a revisión (ver el ajuste de abajo).",
  "ai.set.potholeYAbove": "sin aceptación auto",
  "ai.set.potholeYBelow": "calzada",
  "ai.set.err.minFrames": "Introduzca un número entero de al menos 1.",
  "ai.set.err.drift": "Introduzca una distancia mayor que 0.",
  "ai.set.err.ratio": "Introduzca un valor entre 0 y 1.",
  "ai.set.potholeOffRoad": "Bache por encima de la línea de calzada",
  "ai.set.potholeOffRoadHint": "Qué hacer con un bache cuyo centro está por encima de la línea de calzada (árboles, cielo, arcén): rechazo automático (modo asistido / automático, motivo «Fuera de la calzada») o solo sin aceptación automática y a revisión. En modo manual siempre es una indicación para el revisor.",
  "ai.set.potholeOffRoad.reject": "Rechazar automáticamente",
  "ai.set.potholeOffRoad.review": "Enviar a revisión",
  "ai.set.potholeMaxWidth": "Ancho máximo del recuadro",
  "ai.set.potholeMaxWidthHint": "Fracción del ancho de la imagen (0,40 = 40 %). Un recuadro más ancho se rechaza automáticamente como «Recuadro demasiado grande / arcén» (modo asistido / automático; solo indicación en modo manual). 1 = desactivado.",
  "ai.set.potholeMaxArea": "Área máxima del recuadro",
  "ai.set.potholeMaxAreaHint": "Fracción del área de la imagen (0,12 = 12 %). Un recuadro mayor (tierra del arcén, arbustos, borde de edificio) se rechaza automáticamente como «Recuadro demasiado grande / arcén». 1 = desactivado.",
  "ai.set.potholeEdge": "Rechazar recuadros anchos que tocan el borde de la imagen",
  "ai.set.potholeEdgeHint": "Un recuadro que toca el borde izquierdo o derecho de la imagen (a menos del 1 %) y más ancho que el 25 % de ella es el arcén, no un bache: rechazo automático «Recuadro demasiado grande / arcén» (solo indicación en modo manual).",
  "ai.set.potholeRulesNote": "Reglas contra falsos positivos de baches — los rechazos automáticos solo se aplican en modo asistido y automático; en modo manual se muestran al revisor como sugerencias de la IA.",
  "sign.picker.label": "Señal",
  "sign.picker.search": "Buscar una señal…",
  "sign.picker.candidates": "Sugerencias del clasificador",
  "sign.picker.none": "Ninguna señal coincide con la búsqueda.",
  "sign.picker.loading": "Cargando la lista de señales…",
  "sign.picker.builtin": "Lista de señales integrada (la taxonomía del servidor no está disponible).",
  "sign.picker.selected": "Seleccionada: {name}",
  "sign.candidates": "Top 3 del clasificador",
  "ai.slot.signs_classifier": "Clasificador de señales (códigos)",
  "ai.models.missingClassifier.signs": "No hay clasificador de señales instalado: las señales usan el proceso de una etapa (antiguo).",
  "ai.pipeline.two_stage": "Dos etapas (detector + clasificador)",
  "ai.pipeline.single_stage": "Una etapa (antiguo)",
  "ai.card.taxonomy": "Taxonomía",
  "ai.card.cropPad": "Margen del recorte",
  "ai.perClass.title": "Umbrales y métricas por clase",
  "ai.perClass.code": "Señal",
  "ai.perClass.cardAccept": "Aceptar (ficha)",
  "ai.perClass.cardReject": "Rechazar (ficha)",
  "ai.perClass.effAccept": "Aceptar aplicado",
  "ai.perClass.effReject": "Rechazar aplicado",
  "ai.perClass.empty": "La ficha del modelo no tiene umbrales ni métricas por clase.",
  "ai.src.card_global": "ficha del modelo (global)",
  "ai.src.global": "umbral del tipo",
  "ai.set.perClass": "Umbrales por clase — señales",
  "ai.set.perClassHint": "Umbrales del verificador para un código de señal. Vacío = valor por clase de la ficha, y si no, los umbrales del tipo.",
  "ai.set.perClassEmpty": "La ficha del clasificador de señales no tiene umbrales por clase.",
}

/** Parked-vehicle subtypes (Module 5) — mirrors pv.subtype.* in parked-vehicle.ts. */
const PARKED_VEHICLE_SUBTYPES: Record<L3, Record<string, string>> = {
  en: { blocking: "Blocking the lane", wrong_side: "Wrong side", roadside: "Roadside" },
  fr: { blocking: "Bloque la voie", wrong_side: "Mauvais côté", roadside: "Bord de route" },
  es: { blocking: "Bloquea el carril", wrong_side: "Lado contrario", roadside: "Borde de la vía" },
}

/** Display text of a detection/hazard subtype: sign name for traffic signs, localized parked-vehicle subtypes, else the raw code with spaces. */
export function subtypeText(type: string | null | undefined, sub: string | null | undefined, lang: L3 | string = "en"): string {
  if (!sub) return ""
  if (type === "traffic_sign") return signLabel(sub, lang)
  if (type === "parked_vehicle") {
    const l: L3 = lang === "fr" || lang === "es" ? lang : "en"
    return PARKED_VEHICLE_SUBTYPES[l][sub] ?? sub.replace(/_/g, " ")
  }
  return sub.replace(/_/g, " ")
}
