/**
 * Extra strings for the "account" area. Keys must be namespaced (e.g. "account.title")
 * and present in all three languages; missing ones fall back to English.
 */
export const en: Record<string, string> = {
  // Profile
  "account.noRoles": "No role assigned",
  "account.mfaStatusOn": "On",
  "account.mfaStatusOff": "Off",
  "account.mfaActivate": "Activate",
  "account.mfaDisableTitle": "Disable two-step verification",
  "account.mfaDisableHint": "Confirm with your password and a current code from your authenticator app.",
  "account.mfaRequiredHint": "Your role requires two-step verification, so it cannot be disabled.",
  "account.languageSaved": "Language updated.",
  "account.mapSaved": "Map provider updated. Maps opened from now on use it.",

  // API clients
  "account.clients.created": "API client created.",
  "account.clients.rotated": "Key rotated.",
  "account.clients.revoked": "API client revoked.",
  "account.clients.deleted": "API client deleted.",
  "account.clients.deleteConfirm": "Delete {name}? Its key stops working and the client is removed permanently.",
  "account.clients.keyTitle": "API key for {name}",
  "account.clients.createdBy": "Created by",
  "account.clients.copyFailed": "Could not copy automatically — select the key and copy it manually.",
  "account.clients.done": "I have copied the key",

  // Audit
  "account.audit.refresh": "Refresh",
  "account.audit.clear": "Clear filters",
  "account.audit.userAgent": "User agent",
  "account.audit.total": "{count} entries",
  "account.audit.noDetails": "No additional details.",
  "account.audit.system": "System",

  // Platform settings
  "account.platform.subtitle": "Sign-in protection, outgoing e-mail, base maps and security policy",
  "account.platform.saved": "Settings saved.",
  "account.platform.readOnly": "You can view these settings but not change them.",
  "account.platform.getKeys": "Get keys from:",
  "account.platform.secNone": "None (not recommended)",
  "account.platform.typeRoadmap": "Road map",
  "account.platform.typeSatellite": "Satellite",
  "account.platform.typeTerrain": "Terrain",
  "account.platform.testSent": "Test e-mail sent to {to}.",
  "account.platform.googleOk": "The Google Maps key works.",
  "account.platform.keySet": "Key stored",
  "account.platform.keyUnset": "No key",
  "account.platform.saveFirst": "Save your changes before testing.",
  "account.platform.err.invalid_settings": "Some values are invalid. Check the highlighted fields.",
  "account.platform.err.smtp_not_configured": "E-mail is not configured yet. Fill in and save the SMTP settings first.",
  "account.platform.err.google_not_configured": "Enter and save a Google Maps Platform API key first.",
}

export const fr: Record<string, string> = {
  // Profile
  "account.noRoles": "Aucun rôle attribué",
  "account.mfaStatusOn": "Activée",
  "account.mfaStatusOff": "Désactivée",
  "account.mfaActivate": "Activer",
  "account.mfaDisableTitle": "Désactiver la vérification en deux étapes",
  "account.mfaDisableHint": "Confirmez avec votre mot de passe et un code actuel de votre application d'authentification.",
  "account.mfaRequiredHint": "Votre rôle exige la vérification en deux étapes : vous ne pouvez pas la désactiver.",
  "account.languageSaved": "Langue mise à jour.",
  "account.mapSaved": "Fournisseur de carte mis à jour. Les cartes que vous ouvrirez désormais l'utiliseront.",

  // API clients
  "account.clients.created": "Client API créé.",
  "account.clients.rotated": "Clé renouvelée.",
  "account.clients.revoked": "Client API révoqué.",
  "account.clients.deleted": "Client API supprimé.",
  "account.clients.deleteConfirm": "Supprimer {name} ? Sa clé cessera de fonctionner et le client sera définitivement supprimé.",
  "account.clients.keyTitle": "Clé API de {name}",
  "account.clients.createdBy": "Créé par",
  "account.clients.copyFailed": "Copie automatique impossible — sélectionnez la clé et copiez-la manuellement.",
  "account.clients.done": "J'ai copié la clé",

  // Audit
  "account.audit.refresh": "Actualiser",
  "account.audit.clear": "Effacer les filtres",
  "account.audit.userAgent": "Agent utilisateur",
  "account.audit.total": "{count} entrées",
  "account.audit.noDetails": "Aucun détail supplémentaire.",
  "account.audit.system": "Système",

  // Platform settings
  "account.platform.subtitle": "Protection de la connexion, e-mails sortants, fonds de carte et politique de sécurité",
  "account.platform.saved": "Paramètres enregistrés.",
  "account.platform.readOnly": "Vous pouvez consulter ces paramètres mais pas les modifier.",
  "account.platform.getKeys": "Obtenez vos clés sur :",
  "account.platform.secNone": "Aucun (déconseillé)",
  "account.platform.typeRoadmap": "Plan",
  "account.platform.typeSatellite": "Satellite",
  "account.platform.typeTerrain": "Relief",
  "account.platform.testSent": "E-mail de test envoyé à {to}.",
  "account.platform.googleOk": "La clé Google Maps fonctionne.",
  "account.platform.keySet": "Clé enregistrée",
  "account.platform.keyUnset": "Aucune clé",
  "account.platform.saveFirst": "Enregistrez vos modifications avant de tester.",
  "account.platform.err.invalid_settings": "Certaines valeurs sont invalides. Vérifiez les champs signalés.",
  "account.platform.err.smtp_not_configured": "L'e-mail n'est pas encore configuré. Renseignez et enregistrez d'abord les paramètres SMTP.",
  "account.platform.err.google_not_configured": "Saisissez et enregistrez d'abord une clé API Google Maps Platform.",
}

export const es: Record<string, string> = {
  // Profile
  "account.noRoles": "Ningún rol asignado",
  "account.mfaStatusOn": "Activada",
  "account.mfaStatusOff": "Desactivada",
  "account.mfaActivate": "Activar",
  "account.mfaDisableTitle": "Desactivar la verificación en dos pasos",
  "account.mfaDisableHint": "Confirme con su contraseña y un código actual de su aplicación de autenticación.",
  "account.mfaRequiredHint": "Su rol exige la verificación en dos pasos, por lo que no puede desactivarla.",
  "account.languageSaved": "Idioma actualizado.",
  "account.mapSaved": "Proveedor de mapas actualizado. Los mapas que abra a partir de ahora lo usarán.",

  // API clients
  "account.clients.created": "Cliente API creado.",
  "account.clients.rotated": "Clave renovada.",
  "account.clients.revoked": "Cliente API revocado.",
  "account.clients.deleted": "Cliente API eliminado.",
  "account.clients.deleteConfirm": "¿Eliminar {name}? Su clave dejará de funcionar y el cliente se eliminará de forma permanente.",
  "account.clients.keyTitle": "Clave API de {name}",
  "account.clients.createdBy": "Creado por",
  "account.clients.copyFailed": "No se pudo copiar automáticamente: seleccione la clave y cópiela manualmente.",
  "account.clients.done": "He copiado la clave",

  // Audit
  "account.audit.refresh": "Actualizar",
  "account.audit.clear": "Borrar filtros",
  "account.audit.userAgent": "Agente de usuario",
  "account.audit.total": "{count} entradas",
  "account.audit.noDetails": "Sin detalles adicionales.",
  "account.audit.system": "Sistema",

  // Platform settings
  "account.platform.subtitle": "Protección del inicio de sesión, correo saliente, mapas base y política de seguridad",
  "account.platform.saved": "Configuración guardada.",
  "account.platform.readOnly": "Puede consultar esta configuración, pero no modificarla.",
  "account.platform.getKeys": "Obtenga sus claves en:",
  "account.platform.secNone": "Ninguno (no recomendado)",
  "account.platform.typeRoadmap": "Mapa de carreteras",
  "account.platform.typeSatellite": "Satélite",
  "account.platform.typeTerrain": "Relieve",
  "account.platform.testSent": "Correo de prueba enviado a {to}.",
  "account.platform.googleOk": "La clave de Google Maps funciona.",
  "account.platform.keySet": "Clave guardada",
  "account.platform.keyUnset": "Sin clave",
  "account.platform.saveFirst": "Guarde sus cambios antes de probar.",
  "account.platform.err.invalid_settings": "Algunos valores no son válidos. Revise los campos señalados.",
  "account.platform.err.smtp_not_configured": "El correo aún no está configurado. Complete y guarde primero la configuración SMTP.",
  "account.platform.err.google_not_configured": "Introduzca y guarde primero una clave API de Google Maps Platform.",
}
