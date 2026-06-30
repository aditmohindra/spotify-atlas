"""phase13_era_labels

Revision ID: b4e9d3f82a15
Revises: a3f8c2e91d04
Create Date: 2026-06-29 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4e9d3f82a15'
down_revision: Union[str, Sequence[str], None] = 'a3f8c2e91d04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'era_labels',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('era_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('mood', sa.String(), nullable=False),
        sa.Column('key_tracks', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('edited_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['era_id'], ['user_eras.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('era_id', name='uq_era_labels_era_id'),
    )
    op.create_index(op.f('ix_era_labels_id'), 'era_labels', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_era_labels_id'), table_name='era_labels')
    op.drop_table('era_labels')
