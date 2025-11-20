import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('crime_categories')
export class CrimeCategory {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ type: 'varchar', length: 200, nullable: false })
  name: string;

  @Column({ type: 'float', nullable: false, default: 1.0 })
  harmWeightDefault: number;

  @Column({ type: 'boolean', nullable: false, default: false })
  isPersonal: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  isProperty: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
