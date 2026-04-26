import LocationLog from "../models/LocationLog.js";
import User from "../models/User.js";
import { sendParentGeofenceAlert } from "../services/fcm.js";
import { getDistanceMeters, isValidCoordinate } from "../utils/geo.js";
import {
  logControllerError,
  logControllerStart,
  logControllerSuccess
} from "../utils/controllerLogger.js";

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
  logControllerStart("geofence.saveFcmToken", {
    userId: req.user?._id?.toString(),
    platform: req.body?.platform || "android"
  });

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

    logControllerSuccess("geofence.saveFcmToken", {
      userId: req.user._id.toString(),
      tokenCount: user.fcmTokens.length
    });

    res.json({
      success: true,
      message: "FCM token saved"
    });
  } catch (error) {
    logControllerError("geofence.saveFcmToken", error, {
      userId: req.user?._id?.toString()
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getChildren = async (req, res) => {
  logControllerStart("geofence.getChildren", {
    userId: req.user?._id?.toString(),
    role: req.user?.role
  });

  try {
    if (!requireRole(req.user, "parent", res)) return;

    const children = await User.find({ parent: req.user._id, role: "child" }).select(
      "-password -fcmTokens"
    );

    logControllerSuccess("geofence.getChildren", {
      userId: req.user._id.toString(),
      childCount: children.length
    });

    res.json({
      success: true,
      inviteCode: req.user.inviteCode,
      children
    });
  } catch (error) {
    logControllerError("geofence.getChildren", error, {
      userId: req.user?._id?.toString()
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateChildGeofence = async (req, res) => {
  logControllerStart("geofence.updateChildGeofence", {
    userId: req.user?._id?.toString(),
    childId: req.params?.childId
  });

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

    logControllerSuccess("geofence.updateChildGeofence", {
      userId: req.user._id.toString(),
      childId: child._id.toString(),
      radiusMeters
    });

    res.json({
      success: true,
      child: childResponse
    });
  } catch (error) {
    logControllerError("geofence.updateChildGeofence", error, {
      userId: req.user?._id?.toString(),
      childId: req.params?.childId
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const submitLocation = async (req, res) => {
  logControllerStart("geofence.submitLocation", {
    userId: req.user?._id?.toString(),
    lat: req.body?.lat,
    lon: req.body?.lon
  });

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

    logControllerSuccess("geofence.submitLocation", {
      userId: req.user._id.toString(),
      logId: log._id.toString(),
      isOutside,
      distanceMeters
    });

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
    logControllerError("geofence.submitLocation", error, {
      userId: req.user?._id?.toString(),
      lat: req.body?.lat,
      lon: req.body?.lon
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getLocationLogs = async (req, res) => {
  logControllerStart("geofence.getLocationLogs", {
    userId: req.user?._id?.toString(),
    childId: req.query?.childId
  });

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

    logControllerSuccess("geofence.getLocationLogs", {
      userId: req.user._id.toString(),
      logCount: logs.length,
      childId: req.query?.childId
    });

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    logControllerError("geofence.getLocationLogs", error, {
      userId: req.user?._id?.toString(),
      childId: req.query?.childId
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
