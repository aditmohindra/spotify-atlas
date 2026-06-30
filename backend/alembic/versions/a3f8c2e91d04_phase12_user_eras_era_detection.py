"""phase12_user_eras_era_detection

Revision ID: a3f8c2e91d04
Revises: 7363dcbd4926
Create Date: 2026-06-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f8c2e91d04'
down_revision: Union[str, Sequence[str], None] = '7363dcbd4926'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Replace placeholder user_eras with Phase 12 era-detection schema."""
    op.drop_index(op.f('ix_user_eras_id'), table_name='user_eras')
    op.drop_table('user_eras')

    op.create_table(
        'user_eras',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('era_number', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.DateTime(), nullable=False),
        sa.Column('end_date', sa.DateTime(), nullable=False),
        sa.Column('event_count', sa.Integer(), nullable=False),
        sa.Column('dominant_cluster_ids', sa.ARRAY(sa.Integer()), nullable=True),
        sa.Column('centroid_vector', sa.ARRAY(sa.Float()), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'era_number', name='uq_user_eras_user_era_number'),
    )
    op.create_index(op.f('ix_user_eras_id'), 'user_eras', ['id'], unique=False)


def downgrade() -> None:
    """Restore original placeholder user_eras schema."""
    op.drop_index(op.f('ix_user_eras_id'), table_name='user_eras')
    op.drop_table('user_eras')

    op.create_table(
        'user_eras',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('era_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('mood', sa.String(), nullable=True),
        sa.Column('start_date', sa.DateTime(), nullable=True),
        sa.Column('end_date', sa.DateTime(), nullable=True),
        sa.Column('dominant_clusters', sa.ARRAY(sa.Integer()), nullable=True),
        sa.Column('key_tracks', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_user_eras_id'), 'user_eras', ['id'], unique=False)
