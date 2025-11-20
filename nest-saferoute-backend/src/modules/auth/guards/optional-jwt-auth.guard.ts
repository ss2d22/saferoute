import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    // If there's no user or an error, just return null
    // This allows the request to proceed without authentication
    if (err || !user) {
      return null;
    }
    return user;
  }

  canActivate(context: ExecutionContext) {
    // Always return true to allow the request to proceed
    return super.canActivate(context) as Promise<boolean> | boolean;
  }
}
