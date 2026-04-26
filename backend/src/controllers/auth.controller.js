import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const createToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });
};

const createInviteCode = () => {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
};

const toAuthUser = (user) => {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    parent: user.parent,
    inviteCode: user.inviteCode,
    geofence: user.geofence
  };
};

export const signup = async (req, res) => {
  try {
    const { name, email, password, role = "parent", parentInviteCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required"
      });
    }

    if (!["parent", "child"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be parent or child"
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let parent = null;

    if (role === "child") {
      if (!parentInviteCode) {
        return res.status(400).json({
          success: false,
          message: "Parent invite code is required for child signup"
        });
      }

      parent = await User.findOne({
        inviteCode: parentInviteCode.toUpperCase(),
        role: "parent"
      });

      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent invite code is invalid"
        });
      }
    }

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      parent: parent?._id || null,
      inviteCode: role === "parent" ? createInviteCode() : undefined,
      geofence: parent?.geofence || undefined
    });

    const token = createToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: toAuthUser(user)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const token = createToken(user._id);

    res.json({
      success: true,
      token,
      user: toAuthUser(user)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
