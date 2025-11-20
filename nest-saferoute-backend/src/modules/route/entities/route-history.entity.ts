import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('route_history')
@Index('ix_route_history_user_created', ['userId', 'createdAt'])
export class RouteHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: false })
  userId: string;

  @Column({ type: 'float', nullable: false })
  originLat: number;

  @Column({ type: 'float', nullable: false })
  originLng: number;

  @Column({ type: 'float', nullable: false })
  destinationLat: number;

  @Column({ type: 'float', nullable: false })
  destinationLng: number;

  @Column({ type: 'varchar', length: 50, nullable: false })
  mode: string;

  @Column({ type: 'float', nullable: false })
  safetyScoreBest: number;

  @Column({ type: 'float', nullable: false })
  distanceMBest: number;

  @Column({ type: 'float', nullable: false })
  durationSBest: number;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  requestMeta: Record<string, any>;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'LineString',
    srid: 4326,
    nullable: true,
  })
  routeGeom: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.routeHistory)
  @JoinColumn({ name: 'userId' })
  user: User;
}
