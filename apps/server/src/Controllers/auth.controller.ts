import { Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "@prisma/client";
import { hashSync } from "bcrypt";
import {
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
} from "@src/Requests";
import { database, defaultRoles, prepareUser } from "@src/lib/database";
import { BadRequestException, NotFoundException } from "@src/Exceptions";
import config from "@src/lib/config";
import { AuthRequest } from "@src/types";
import mail from "@src/lib/mail";

/**
 * Login users
 * @param request Http Request
 * @param response Http Response
 */
const signIn = async (request: LoginRequest, response: Response) => {
  // user email
  const { email } = request.body;

  // retrieve user
  const user = (await database.user.findUnique({
    where: { email },
  })) as (Partial<User> & { id: number }) | null;

  // check the user's existence
  if (!user) {
    throw new NotFoundException("User");
  }

  // accessToken
  const accessToken = jwt.sign(
    { id: user.id, jti: user.id },
    config.SECRET_ACCESS,
    {
      expiresIn: config.DURATION_ACCESS,
    }
  );

  // refreshToken
  const refreshToken = jwt.sign(
    { id: user.id, jti: user.id },
    config.SECRET_REFRESH
  );

  // create new refreshToken
  await database.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
    },
  });

  // remove password
  delete user.password;

  // return user with refreshToken
  return response.json({
    user,
    accessToken,
    refreshToken,
  });
};

const signOut = async (request: AuthRequest, response: Response) => {
  const { token } = request.auth!;

  await database.refreshToken.delete({
    where: {
      token,
    },
  });

  return response.sendStatus(204);
};

/**
 * Register users
 * @param request Http Request
 * @param response Http Response
 */
const signUp = async (request: RegisterRequest, response: Response) => {
  const { username, email, password, bio, url } = request.body;

  // user
  const user = await database.user.create({
    data: {
      username,
      email,
      bio,
      url,
      password: hashSync(password, Number(config.SALT)),
      roleId: defaultRoles.MEMBER,
    },
    include: {
      Role: true,
    },
  });

  // accessToken
  const accessToken = jwt.sign(
    { id: user.id, jti: user.id },
    config.SECRET_ACCESS,
    {
      expiresIn: config.DURATION_ACCESS,
    }
  );

  // refresh token
  const refreshToken = jwt.sign(
    { id: user.id, jti: user.id },
    config.SECRET_REFRESH
  );

  // create new refresh token
  await database.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
    },
  });

  // response
  return response.status(201).json({
    user: prepareUser(user),
    accessToken,
    refreshToken,
  });
};

/**
 * refresh access token
 * @param request Http Request
 * @param response Http Response
 */
const refresh = async (request: AuthRequest, response: Response) => {
  // user
  const { user, token } = request.auth!;

  // new accessToken
  const accessToken = jwt.sign(
    {
      id: user.id,
      jti: user.id,
    },
    config.SECRET_ACCESS,
    {
      expiresIn: config.DURATION_ACCESS,
    }
  );

  // new refreshToken
  const refreshToken = jwt.sign(
    {
      id: user.id,
      jti: user.id,
    },
    config.SECRET_REFRESH
  );

  // store new refreshToken
  await database.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
    },
  });

  // remove old token
  await database.refreshToken.delete({
    where: {
      token,
    },
  });

  return response.json({
    accessToken,
    refreshToken,
  });
};

/**
 * Get user profile
 * @param request Http Request
 * @param response Http Response
 */
const profile = async (request: AuthRequest, response: Response) => {
  // retrieve user from request
  const { user } = request.auth!;

  // return user
  return response.json(prepareUser(user));
};

/**
 * Update user profile
 * @param request Http Request
 * @param response Http Response
 */
const updateProfile = async (
  request: UpdateProfileRequest,
  response: Response
) => {
  // authenticated user
  const { user } = request.auth!;

  // update items
  const { username, url, bio } = request.body;

  // update user
  await database.user.update({
    where: {
      id: user.id,
    },
    data: {
      username,
      url,
      bio,
    },
  });

  // return updated user
  return response.sendStatus(204);
};

/**
 * Change user password
 * @param request Http Request
 * @param response Http Response
 */
const changePassword = async (
  request: ChangePasswordRequest,
  response: Response
) => {
  // extract password
  const { newPassword: password } = request.body;

  // extract auth user
  let { user } = request.auth!;

  // update user password with hashed password
  user = await database.user.update({
    where: {
      id: user.id,
    },
    data: {
      password: hashSync(password, Number(config.SALT)),
    },
  });

  // 204 success no response
  return response.sendStatus(204);
};

/**
 * Send forgot password email to user
 * @param request Http Request
 * @param response Http Response
 */
const forgotPassword = async (
  request: ForgotPasswordRequest,
  response: Response
) => {
  // extract email
  const { email } = request.body;

  // retrieve user using email
  const user = await database.user.findUnique({ where: { email } });

  if (!user) {
    return response.status(200).json({
      message:
        "If the email is present in our database, a corresponding email will be sent to it.",
    });
  }

  // issue new forgotpasswordtoken
  const token = jwt.sign(
    { id: user.id, jti: user.id },
    config.SECRET_FORGOT_PASSWORD,
    {
      expiresIn: config.DURATION_FORGOT_PASSWORD,
    }
  );

  // store token
  await database.forgotPasswordToken.create({
    data: {
      token,
      userId: user.id,
    },
  });

  // send email
  await mail.sendMail({
    from: config.SMTP_FROM_ADDRESS,
    to: user.email,
    subject: "Forgot Password",
    text: `${config.CLIENT_URL}/reset-password/${token}`,
  });

  // return 204
  return response.status(200).json({
    message:
      "If the email is present in our database, a corresponding email will be sent to it.",
  });
};

/**
 * Reset user password
 * @param request Http Request
 * @param response Http Response
 */
const resetPassword = async (
  request: ResetPasswordRequest,
  response: Response
) => {
  // extract token
  const { token } = request.params;

  // user id
  let id: number;

  try {
    // decode and verify token
    const decoded = jwt.verify(token, config.SECRET_FORGOT_PASSWORD) as {
      id: number;
    };

    // set user id
    id = decoded.id;
  } catch (err: any) {
    // token inavlid
    throw new BadRequestException(err.message);
  }

  // retrieve user
  const user = await database.user.findUnique({ where: { id } });

  // user does not exists
  if (!user) throw new NotFoundException("User");

  // retrieve tokens
  const tokens = await database.forgotPasswordToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  // the used token does not match the last issued token
  if (!tokens.length || tokens[0].token !== token) {
    throw new BadRequestException("Token is not valid");
  }

  // extract password from request body
  const { password } = request.body;

  // update the user with hashed password
  await database.user.update({
    where: { id: user.id },
    data: {
      password: hashSync(password, Number(config.SALT)),
    },
  });

  // remove all tokens
  await database.forgotPasswordToken.deleteMany({
    where: {
      userId: user.id,
    },
  });

  // return success
  return response.sendStatus(204);
};

/**
 * Send user confirmation email
 * @param request Http Request
 * @param response Http Response
 */
const sendConfirmationEmail = async (
  request: AuthRequest,
  response: Response
) => {
  // retrieve user
  const { user } = request.auth!;

  // check if user is already verified
  if (user.verifiedAt) {
    throw new BadRequestException("Already verified");
  }

  // create token
  const token = jwt.sign(
    { id: user.id, jti: user.id },
    config.SECRET_CONFIRM_EMAIL,
    {
      expiresIn: config.DURATION_CONFIRM_EMAIL,
    }
  );

  // store token
  await database.confirmEmailToken.create({ data: { token, userId: user.id } });

  // send email
  await mail.sendMail({
    from: config.SMTP_FROM_ADDRESS,
    to: user.email,
    subject: "Email address confirmation",
    html: `<a href="${config.CLIENT_URL}/confirm-email/${token}" >Confirm</a>`,
  });

  // return response
  return response.sendStatus(204);
};

/**
 * Confirm user email
 * @param request Http Request
 * @param response Http Response
 */
const confirmEmail = async (request: AuthRequest, response: Response) => {
  // extract token
  const { token } = request.params;

  // user id
  let id: number;

  try {
    // decode token
    const decoded = jwt.verify(token, config.SECRET_CONFIRM_EMAIL) as {
      id: number;
    };

    // set user id
    id = decoded.id;
  } catch (err: any) {
    throw new BadRequestException(err.message);
  }

  // retrieve user
  const user = await database.user.findUnique({ where: { id } });

  // check user existance
  if (!user) {
    throw new NotFoundException("User");
  }

  const tokens = await database.confirmEmailToken.findMany({
    where: {
      token,
      userId: user.id,
    },
  });

  if (!tokens.length) {
    throw new BadRequestException("Token is not valid");
  }

  // update user
  await database.user.update({
    where: { id: user.id },
    data: {
      verifiedAt: new Date(),
    },
  });

  // destroy tokens
  await database.confirmEmailToken.deleteMany({
    where: {
      userId: user.id,
    },
  });

  // send success
  return response.sendStatus(204);
};

export const authController = {
  signIn,
  signUp,
  signOut,
  profile,
  changePassword,
  updateProfile,
  forgotPassword,
  resetPassword,
  sendConfirmationEmail,
  confirmEmail,
  refresh,
};
