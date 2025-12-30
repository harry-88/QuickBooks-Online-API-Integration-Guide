import { Module } from '@nestjs/common';
import { QuickbooksController } from './quickbooks.controller';
import { QuickbooksService } from './quickbooks.service';
import { AuthTokenInterceptor } from './interceptors/auth-token.interceptor';

@Module({
  controllers: [QuickbooksController],
  providers: [QuickbooksService, AuthTokenInterceptor],
  exports: [QuickbooksService],
})
export class QuickbooksModule {}

