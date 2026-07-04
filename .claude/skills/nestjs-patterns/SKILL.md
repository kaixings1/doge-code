---
name: nestjs-patterns
description: "NestJS 开发模式 — 模块化 TypeScript 后端的生产级 NestJS 模式。"
metadata:
 origin: ECC
---

# NestJS 开发模式

模块化 TypeScript 后端的生产级 NestJS 模式。

## 使用时机
- 构建 NestJS API 或服务时
- 组织模块、控制器和提供者时
- 添加 DTO 验证、守卫、拦截器或异常过滤器时
- 配置环境感知设置和数据库集成时
- 测试 NestJS 单元或 HTTP 端点时

## 项目结构
```text
src/
+-- app.module.ts
+-- main.ts
+-- common/
| +-- filters/
| +-- guards/
| +-- interceptors/
| +-- pipes/
+-- config/
+-- modules/
| +-- auth/
| +-- users/
+-- prisma/ or database/
```

## 启动和全局验证
```ts
async function bootstrap() {
 const app = await NestFactory.create(AppModule, { bufferLogs: true });
 app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
 app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
 app.useGlobalFilters(new HttpExceptionFilter());
 await app.listen(process.env.PORT ?? 3000);
}
```

## 模块、控制器和提供者
```ts
@Module({ controllers: [UsersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
```

## DTO 和验证
```ts
export class CreateUserDto {
 @IsEmail() email: string;
 @IsString() @Length(2,80) name: string;
 @IsOptional() @IsEnum(UserRole) role?: UserRole;
}
```

## 认证、守卫和请求上下文
使用 @UseGuards(JwtAuthGuard, RolesGuard) 和 @Roles(admin) 装饰器进行访问控制。

## 异常过滤器和错误格式
保持 API 一致的错误响应格式。

## 配置和环境验证
ConfigModule.forRoot() 启动时验证环境变量。

## 持久化和事务
将仓库/ORM 代码放在提供者之后，使用领域语言。

## 测试
```ts
describe(UsersController, () => {
 let app: INestApplication;
 beforeAll(async () => {
 const moduleRef = await Test.createTestingModule({ imports: [UsersModule] }).compile();
 app = moduleRef.createNestApplication();
 await app.init();
 });
});
```

## 生产默认设置
- 启用结构化日志和请求关联 ID
- 无效环境/配置时终止而非部分启动
- 优先使用异步提供者初始化 DB/缓存客户端
- 后台任务和事件消费者放在独立模块中
- 对公共端点明确设置速率限制、认证和审计日志