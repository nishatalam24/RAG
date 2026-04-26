import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["parent", "child"],
      default: "parent",
      required: true
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true
    },
    fcmTokens: [
      {
        token: {
          type: String,
          required: true
        },
        platform: {
          type: String,
          enum: ["android", "ios", "web"],
          default: "android"
        },
        updatedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    geofence: {
      centerLat: {
        type: Number,
        default: 28.545855
      },
      centerLon: {
        type: Number,
        default: 77.299128
      },
      radiusMeters: {
        type: Number,
        default: 500
      },
      active: {
        type: Boolean,
        default: true
      }
    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
