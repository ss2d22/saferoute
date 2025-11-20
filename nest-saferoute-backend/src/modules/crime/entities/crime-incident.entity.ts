import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CrimeCategory } from './crime-category.entity';

@Entity('crime_incidents')
@Index('ix_crime_incidents_month_category', ['month', 'categoryId'])
@Index('ix_crime_incidents_month_desc', ['month'])
export class CrimeIncident {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  externalId: string | null;

  @Index()
  @Column({ type: 'date', nullable: false })
  month: Date;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: false })
  categoryId: string;

  @Column({ type: 'varchar', length: 200, nullable: false })
  crimeType: string;

  @Column({ type: 'text', nullable: true })
  context: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  persistentId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lsoaCode: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: false })
  forceId: string;

  @Column({ type: 'text', nullable: false })
  locationDesc: string;

  // PostGIS geometry column - stored as text, converted to/from GeoJSON
  @Index('ix_crime_incidents_geom', { spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: false,
  })
  geom: string;

  // Latitude and longitude for easier querying (denormalized from geom)
  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  ingestedAt: Date;

  @ManyToOne(() => CrimeCategory)
  @JoinColumn({ name: 'categoryId' })
  category: CrimeCategory;
}
