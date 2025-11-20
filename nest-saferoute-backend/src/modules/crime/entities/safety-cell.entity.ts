import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';

@Entity('safety_cells')
@Index('ix_safety_cells_month_desc', ['month'])
@Index('unique_cell_month', ['cellId', 'month'], { unique: true })
export class SafetyCell {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 200, nullable: false })
  cellId: string;

  @Index('ix_safety_cells_geom', { spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
    nullable: false,
  })
  geom: string;

  @Index()
  @Column({ type: 'date', nullable: false })
  month: Date;

  @Column({ type: 'int', nullable: false, default: 0 })
  crimeCountTotal: number;

  @Column({ type: 'float', nullable: false, default: 0 })
  crimeCountWeighted: number;

  @Column({ type: 'jsonb', nullable: false, default: {} })
  stats: Record<string, any>;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
