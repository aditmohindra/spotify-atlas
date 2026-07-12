"""add cohesion_score to cluster_labels

Revision ID: c8e4f1a29b70
Revises: 719211852fb8
Create Date: 2026-07-12 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8e4f1a29b70"
down_revision: Union[str, Sequence[str], None] = "719211852fb8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cluster_labels",
        sa.Column("cohesion_score", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cluster_labels", "cohesion_score")
