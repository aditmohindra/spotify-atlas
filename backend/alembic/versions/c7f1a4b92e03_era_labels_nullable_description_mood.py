"""phase13_era_labels_nullable_description_mood

Revision ID: c7f1a4b92e03
Revises: b4e9d3f82a15
Create Date: 2026-06-30 05:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7f1a4b92e03'
down_revision: Union[str, Sequence[str], None] = 'b4e9d3f82a15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('era_labels', 'description', existing_type=sa.String(), nullable=True)
    op.alter_column('era_labels', 'mood', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    op.alter_column('era_labels', 'mood', existing_type=sa.String(), nullable=False)
    op.alter_column('era_labels', 'description', existing_type=sa.String(), nullable=False)
