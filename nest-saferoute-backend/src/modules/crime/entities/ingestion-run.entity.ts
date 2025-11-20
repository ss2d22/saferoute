import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('ingestion_runs')
@Index('ix_ingestion_runs_area_month', ['areaName', 'month'])
@Index('ix_ingestion_runs_status', ['status'])
export class IngestionRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: false })
  areaName: string;

  @Index()
  @Column({ type: 'date', nullable: false })
  month: Date;

  @Index()
  @Column({ type: 'varchar', length: 50, nullable: false })
  status: 'pending' | 'running' | 'success' | 'failed' | 'partial';

  @CreateDateColumn({ type: 'timestamp with time zone' })
  startedAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', nullable: false, default: 0 })
  recordsIngested: number;

  @Column({ type: 'int', nullable: false, default: 0 })
  tilesProcessed: number;

  @Column({ type: 'int', nullable: false, default: 0 })
  tilesTotal: number;
}
