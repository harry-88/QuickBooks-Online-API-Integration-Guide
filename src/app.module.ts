import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuickbooksModule } from './quickbooks/quickbooks.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    QuickbooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

