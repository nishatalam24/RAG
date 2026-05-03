import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
  logControllerError,
  logControllerStart,
  logControllerSuccess
} from "../utils/controllerLogger.js";

const createToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });
};

const normalizeSubject = (subject = "") => {
  return subject.trim().replace(/\s+/g, " ");
};

const getSubjectKey = (subject = "") => {
  return normalizeSubject(subject).toLowerCase();
};

const toAuthUser = (user) => {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    primarySubject: user.primarySubject
  };
};

export const signup = async (req, res) => {
  logControllerStart("auth.signup", {
    email: req.body?.email,
    role: req.body?.role || "student"
  });

  try {
    const {
      name,
      email,
      password,
      role = "student",
      primarySubject
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required"
      });
    }

    if (!["teacher", "student"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be teacher or student"
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }

    const normalizedSubject = normalizeSubject(primarySubject);

    if (role === "teacher" && !normalizedSubject) {
      return res.status(400).json({
        success: false,
        message: "Primary subject is required for teacher signup"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      primarySubject: role === "teacher" ? normalizedSubject : "",
      primarySubjectKey: role === "teacher" ? getSubjectKey(normalizedSubject) : ""
    });

    const token = createToken(user._id);

    logControllerSuccess("auth.signup", {
      userId: user._id.toString(),
      role: user.role
    });

    res.status(201).json({
      success: true,
      token,
      user: toAuthUser(user)
    });
  } catch (error) {
    logControllerError("auth.signup", error, {
      email: req.body?.email,
      role: req.body?.role || "student"
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const login = async (req, res) => {
  logControllerStart("auth.login", {
    email: req.body?.email
  });

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

    logControllerSuccess("auth.login", {
      userId: user._id.toString(),
      role: user.role
    });

    res.json({
      success: true,
      token,
      user: toAuthUser(user)
    });
  } catch (error) {
    logControllerError("auth.login", error, {
      email: req.body?.email
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
