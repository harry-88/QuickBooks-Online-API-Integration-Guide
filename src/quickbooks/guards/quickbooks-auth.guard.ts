import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { QuickbooksService } from '../quickbooks.service';

@Injectable()
export class QuickbooksAuthGuard implements CanActivate {
  constructor(private readonly quickbooksService: QuickbooksService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    // Extract Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid authorization header format. Use: Bearer <token>');
    }

    const accessToken = parts[1];

    if (!accessToken) {
      throw new UnauthorizedException('Access token is missing');
    }

    // Get realmId from query params, body, or use existing one from service
    const realmId = 
      request.query?.realmId || 
      request.body?.realmId || 
      this.quickbooksService.getTokenStatus().realmId;

    if (!realmId) {
      throw new UnauthorizedException(
        'Realm ID is required. Provide it in query parameter ?realmId=xxx, ' +
        'or set tokens first using POST /quickbooks/auth/set-tokens',
      );
    }

    // Set the token in the service so API calls can use it
    this.quickbooksService.setAccessToken(accessToken, realmId);

    return true;
  }
}

