import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

const initializeFirebase = () => {
  if (admin.apps.length > 0) {
    return true;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is missing in .env");
    return false;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    return true;
  } catch (error) {
    console.error("Firebase init error:", error.message);
    return false;
  }
};

const token = process.argv[2];
const title = process.argv[3] || "Test Notification";
const body = process.argv[4] || "FCM test message from backend script";

const testFcm = async () => {
  if (!token) {
    console.log('Usage: node scripts/testFcm.js "<FCM_TOKEN>" "[title]" "[body]"');
    process.exit(1);
  }

  const canSend = initializeFirebase();

  if (!canSend) {
    process.exit(1);
  }

  const response = await admin.messaging().send({
    token,
    notification: {
      title,
      body
    },
    data: {
      type: "TEST_NOTIFICATION",
      sentAt: new Date().toISOString()
    }
  });

  console.log("FCM test notification sent successfully");
  console.log("Message ID:", response);
};

testFcm().catch((error) => {
  console.error("FCM test failed:");
  console.error(error.message);
  process.exit(1);
});
