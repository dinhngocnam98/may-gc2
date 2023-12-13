import { Module } from '@nestjs/common';
import Config from './common/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongoDbConfig } from './common/config.interface';
import { Gc2Module } from './gc2/gc2.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [Config],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<MongoDbConfig>('mongodb').databaseUrl,
      }),
      inject: [ConfigService],
    }),
    Gc2Module,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
