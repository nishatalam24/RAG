import express from "express";
import {
  getChildren,
  getLocationLogs,
  saveFcmToken,
  submitLocation,
  updateChildGeofence
} from "../controllers/geofence.controller.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.use(auth);

router.post("/fcm-token", saveFcmToken);
router.get("/parent/children", getChildren);
router.patch("/parent/children/:childId/geofence", updateChildGeofence);
router.get("/parent/location-logs", getLocationLogs);
router.post("/child/location", submitLocation);

export default router;
