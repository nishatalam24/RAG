import LocationLog from "../models/LocationLog.js";
import User from "../models/User.js";
import { sendParentGeofenceAlert } from "../services/fcm.js";
import { getDistanceMeters, isValidCoordinate } from "../utils/geo.js";

const requireRole = (user, role, res) => {
  if (user.role !== role) {
    res.status(403).json({
      success: false,
      message: `${role} access required`
    });
    return false;
  }

  return true;
};

export const saveFcmToken = async (req, res) => {
  try {
    const { token, platform = "android" } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required"
      });
    }

    const user = await User.findById(req.user._id);
    user.fcmTokens = user.fcmTokens.filter((item) => item.token !== token);
    user.fcmTokens.push({ token, platform, updatedAt: new Date() });
    await user.save();

    res.json({
      success: true,
      message: "FCM token saved"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getChildren = async (req, res) => {
  try {
    if (!requireRole(req.user, "parent", res)) return;

    const children = await User.find({ parent: req.user._id, role: "child" }).select(
      "-password -fcmTokens"
    );

    res.json({
      success: true,
      inviteCode: req.user.inviteCode,
      children
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateChildGeofence = async (req, res) => {
  try {
    if (!requireRole(req.user, "parent", res)) return;

    const { childId } = req.params;
    const centerLat = Number(req.body.centerLat);
    const centerLon = Number(req.body.centerLon);
    const radiusMeters = Number(req.body.radiusMeters);

    if (!isValidCoordinate(centerLat, centerLon) || !Number.isFinite(radiusMeters)) {
      return res.status(400).json({
        success: false,
        message: "Valid centerLat, centerLon, and radiusMeters are required"
      });
    }

    if (radiusMeters < 10 || radiusMeters > 10000) {
      return res.status(400).json({
        success: false,
        message: "Radius must be between 10 and 10000 meters"
      });
    }

    const child = await User.findOne({
      _id: childId,
      parent: req.user._id,
      role: "child"
    });

    if (!child) {
      return res.status(404).json({
        success: false,
        message: "Child not found"
      });
    }

    child.geofence = {
      centerLat,
      centerLon,
      radiusMeters,
      active: true
    };

    await child.save();
    const childResponse = child.toObject();
    delete childResponse.password;
    delete childResponse.fcmTokens;

    res.json({
      success: true,
      child: childResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const submitLocation = async (req, res) => {
  try {
    if (!requireRole(req.user, "child", res)) return;

    const lat = Number(req.body.lat);
    const lon = Number(req.body.lon);
    const accuracy = req.body.accuracy === undefined ? null : Number(req.body.accuracy);

    if (!isValidCoordinate(lat, lon)) {
      return res.status(400).json({
        success: false,
        message: "Valid lat and lon are required"
      });
    }

    const child = await User.findById(req.user._id).populate("parent");

    if (!child.parent) {
      return res.status(400).json({
        success: false,
        message: "Child is not linked with a parent"
      });
    }

    const { centerLat, centerLon, radiusMeters, active } = child.geofence;

    if (!active) {
      return res.status(400).json({
        success: false,
        message: "Geofence is not active"
      });
    }

    const distanceMeters = getDistanceMeters(centerLat, centerLon, lat, lon);
    const isOutside = distanceMeters > radiusMeters;

    const log = await LocationLog.create({
      child: child._id,
      parent: child.parent._id,
      lat,
      lon,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      centerLat,
      centerLon,
      radiusMeters,
      distanceMeters,
      isOutside
    });

    if (isOutside) {
      await sendParentGeofenceAlert({
        parent: child.parent,
        child,
        distanceMeters,
        radiusMeters
      });
    }

    res.status(201).json({
      success: true,
      log,
      geofence: {
        centerLat,
        centerLon,
        radiusMeters,
        distanceMeters,
        isOutside
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getLocationLogs = async (req, res) => {
  try {
    if (!requireRole(req.user, "parent", res)) return;

    const query = { parent: req.user._id };

    if (req.query.childId) {
      query.child = req.query.childId;
    }

    const logs = await LocationLog.find(query)
      .populate("child", "name email")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
