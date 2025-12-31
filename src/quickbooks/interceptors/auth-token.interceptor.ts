import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { QuickbooksService } from '../quickbooks.service';

@Injectable()
export class AuthTokenInterceptor implements NestInterceptor {
  constructor(
    private readonly quickbooksService: QuickbooksService,
    private readonly configService: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // If Authorization header is present, extract token and use it
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const accessToken = parts[1];
        
        // Get realmId from env, query params, or existing service state
        const realmId =
          request.query?.realmId ||
          request.body?.realmId ||
          this.configService.get<string>('QUICKBOOKS_REALM_ID') ||
          this.quickbooksService.getTokenStatus().realmId;

        if (accessToken && realmId) {
          // Set the token in the service so API calls can use it
          this.quickbooksService.setAccessToken(accessToken, realmId);
        }
      }
    }

    return next.handle();
  }
}


