import mongoose from "mongoose";

const locationLogSchema = new mongoose.Schema(
  {
    child: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    lat: {
      type: Number,
      required: true
    },
    lon: {
      type: Number,
      required: true
    },
    accuracy: {
      type: Number,
      default: null
    },
    centerLat: {
      type: Number,
      required: true
    },
    centerLon: {
      type: Number,
      required: true
    },
    radiusMeters: {
      type: Number,
      required: true
    },
    distanceMeters: {
      type: Number,
      required: true
    },
    isOutside: {
      type: Boolean,
      required: true
    }
  },
  { timestamps: true }
);

locationLogSchema.index({ child: 1, createdAt: -1 });
locationLogSchema.index({ parent: 1, createdAt: -1 });

export default mongoose.model("LocationLog", locationLogSchema);
