// Auth HTTP controllers (Sprint 2, M2). Thin: validate already happened via Zod middleware;
// these translate service calls into the response envelope. No business logic here.

import type { Request, Response } from 'express';
import type {
  RegisterInput,
  VerifyEmailInput,
  ResendVerificationInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@leados/shared';
import { ErrorCode } from '@leados/shared';
import { sendSuccess } from '../../core/http/envelope.js';
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE_NAME } from '../../core/auth/cookies.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthService } from './auth.service.js';

export function createAuthController(service: AuthService) {
  return {
    async register(req: Request, res: Response): Promise<void> {
      const input = req.body as RegisterInput;
      const result = await service.register(input);
      sendSuccess(res, result, 201);
    },

    async login(req: Request, res: Response): Promise<void> {
      const input = req.body as LoginInput;
      const result = await service.login(input, {
        deviceInfo: req.headers['user-agent']?.slice(0, 255),
        ipAddress: req.ip,
      });
      // Refresh token → HttpOnly cookie; access token → response body (kept in memory).
      setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
      sendSuccess(res, {
        accessToken: result.accessToken,
        expiresIn: result.accessTokenExpiresIn,
        user: result.user,
        organization: result.organization,
        organizations: result.organizations,
      });
    },

    async refresh(req: Request, res: Response): Promise<void> {
      const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      if (!raw) throw new AppError(ErrorCode.UNAUTHORIZED, 'No session');
      const result = await service.refresh(raw, {
        deviceInfo: req.headers['user-agent']?.slice(0, 255),
        ipAddress: req.ip,
      });
      setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
      sendSuccess(res, { accessToken: result.accessToken, expiresIn: result.accessTokenExpiresIn });
    },

    async logout(req: Request, res: Response): Promise<void> {
      const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      if (raw) await service.logout(raw);
      clearRefreshCookie(res);
      sendSuccess(res, { success: true });
    },

    async listSessions(req: Request, res: Response): Promise<void> {
      const sessions = await service.listSessions(req.auth!.userId);
      sendSuccess(res, { sessions });
    },

    async revokeSession(req: Request, res: Response): Promise<void> {
      await service.revokeSession(req.auth!.userId, req.params.id ?? '');
      sendSuccess(res, { revoked: true });
    },

    async forgotPassword(req: Request, res: Response): Promise<void> {
      const { email } = req.body as ForgotPasswordInput;
      await service.forgotPassword(email);
      // Generic response regardless of whether the email exists (no enumeration).
      sendSuccess(res, { sent: true }, 202);
    },

    async resetPassword(req: Request, res: Response): Promise<void> {
      const { token, password } = req.body as ResetPasswordInput;
      await service.resetPassword(token, password);
      sendSuccess(res, { reset: true });
    },

    async me(req: Request, res: Response): Promise<void> {
      const profile = await service.getMe(req.auth!.userId);
      sendSuccess(res, profile);
    },

    async verifyEmail(req: Request, res: Response): Promise<void> {
      const { token } = req.body as VerifyEmailInput;
      await service.verifyEmail(token);
      sendSuccess(res, { verified: true });
    },

    async resendVerification(req: Request, res: Response): Promise<void> {
      const { email } = req.body as ResendVerificationInput;
      await service.resendVerification(email);
      // Generic response regardless of whether the email exists (no enumeration).
      sendSuccess(res, { sent: true }, 202);
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
