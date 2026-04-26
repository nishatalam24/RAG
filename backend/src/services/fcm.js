import admin from "firebase-admin";
import fs from "fs";

let initialized = false;

const initializeFirebase = () => {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return true;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountJson && !serviceAccountPath) {
    return false;
  }

  try {
    const rawServiceAccount = serviceAccountPath
      ? fs.readFileSync(serviceAccountPath, "utf8")
      : serviceAccountJson;
    const serviceAccount = JSON.parse(rawServiceAccount);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    initialized = true;
    return true;
  } catch (error) {
    console.error("Firebase init error:", error.message);
    return false;
  }
};

export const sendParentGeofenceAlert = async ({ parent, child, distanceMeters, radiusMeters }) => {
  const canSend = initializeFirebase();

  if (!canSend || !parent.fcmTokens?.length) {
    console.log("FCM skipped: Firebase credentials or parent tokens are missing");
    return;
  }

  const tokens = parent.fcmTokens.map((item) => item.token);

  await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: "Geofence alert",
      body: `${child.name} is outside the ${radiusMeters}m geofence (${distanceMeters.toFixed(
        0
      )}m away).`
    },
    data: {
      childId: child._id.toString(),
      distanceMeters: distanceMeters.toFixed(2),
      radiusMeters: String(radiusMeters),
      type: "GEOFENCE_OUTSIDE"
    }
  });
};
