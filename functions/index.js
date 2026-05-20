const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const MASTER_ADMIN_EMAIL = 'admin@fmac.com';

exports.adminSetTempPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  if (request.auth.token.email !== MASTER_ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Only master admin can perform this action');
  }

  const { uid } = request.data;
  if (!uid) {
    throw new HttpsError('invalid-argument', 'uid is required');
  }

  await admin.auth().updateUser(uid, { password: '000000' });

  await admin.firestore().doc(`users/${uid}`).update({
    forcePasswordReset: true,
    tempPasswordSetAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});
