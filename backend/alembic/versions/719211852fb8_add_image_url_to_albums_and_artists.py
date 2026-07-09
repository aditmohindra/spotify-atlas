"""add_image_url_to_albums_and_artists

Revision ID: 719211852fb8
Revises: 476868b9ab11
Create Date: 2026-07-07 23:41:25.172210

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '719211852fb8'
down_revision: Union[str, Sequence[str], None] = '476868b9ab11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('albums', sa.Column('image_url', sa.String(), nullable=True))
    op.add_column('artists', sa.Column('image_url', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('artists', 'image_url')
    op.drop_column('albums', 'image_url')
