from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, ARRAY, Text, JSON, UniqueConstraint, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    spotify_id = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    listening_events = relationship("ListeningEvent", back_populates="user")
    eras = relationship("UserEra", back_populates="user")


class Artist(Base):
    __tablename__ = "artists"

    id = Column(Integer, primary_key=True, index=True)
    spotify_artist_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    genres = Column(ARRAY(String), nullable=True)
    popularity = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tracks = relationship("Track", back_populates="artist")


class Album(Base):
    __tablename__ = "albums"

    id = Column(Integer, primary_key=True, index=True)
    spotify_album_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    release_date = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tracks = relationship("Track", back_populates="album")


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, index=True)
    spotify_track_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    artist_id = Column(Integer, ForeignKey("artists.id"), nullable=True)
    album_id = Column(Integer, ForeignKey("albums.id"), nullable=True)
    popularity = Column(Integer, nullable=True)
    danceability = Column(Float, nullable=True)
    energy = Column(Float, nullable=True)
    valence = Column(Float, nullable=True)
    tempo = Column(Float, nullable=True)
    acousticness = Column(Float, nullable=True)
    instrumentalness = Column(Float, nullable=True)
    feature_document = Column(Text, nullable=True)
    scene_document = Column(Text, nullable=True)
    sound_document = Column(Text, nullable=True)
    behavior_document = Column(Text, nullable=True)

    # GetSongBPM audio features
    bpm = Column(Integer, nullable=True)
    audio_energy = Column(Integer, nullable=True)
    audio_danceability = Column(Integer, nullable=True)
    audio_acousticness = Column(Integer, nullable=True)
    audio_liveness = Column(Integer, nullable=True)
    audio_key = Column(String, nullable=True)
    getsongbpm_id = Column(String, nullable=True)
    audio_features_source = Column(String, nullable=True)

    # Vibe document columns
    vibe_document = Column(Text, nullable=True)
    vibe_combined_document = Column(Text, nullable=True)
    pure_prose_document = Column(Text, nullable=True)
    vibe_source = Column(String, nullable=True)
    vibe_generated_at = Column(DateTime, nullable=True)
    vibe_edited_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    artist = relationship("Artist", back_populates="tracks")
    album = relationship("Album", back_populates="tracks")
    listening_events = relationship("ListeningEvent", back_populates="track")
    embeddings = relationship("TrackEmbedding", back_populates="track")
    coordinates = relationship("TrackCoordinate", back_populates="track", uselist=False)
    cluster = relationship("TrackCluster", back_populates="track", uselist=False)


class ListeningEvent(Base):
    __tablename__ = "listening_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    played_at = Column(DateTime, nullable=True)
    source = Column(String, nullable=True)
    ms_played = Column(Integer, nullable=True)
    spotify_track_uri = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="listening_events")
    track = relationship("Track", back_populates="listening_events")


class TrackEmbedding(Base):
    __tablename__ = "track_embeddings"
    __table_args__ = (UniqueConstraint('track_id', 'document_type', name='uq_track_embeddings_track_doc_type'),)

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    model = Column(String, nullable=False)
    vector = Column(ARRAY(Float), nullable=False)
    document_type = Column(String, nullable=False, default='original')
    created_at = Column(DateTime, server_default=func.now())

    track = relationship("Track", back_populates="embeddings")


class TrackCoordinate(Base):
    __tablename__ = "track_coordinates"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), unique=True, nullable=False)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    track = relationship("Track", back_populates="coordinates")


class TrackVibeCoordinate(Base):
    __tablename__ = "track_vibe_coordinates"

    id = Column(Integer, primary_key=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), unique=True, nullable=False)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    track = relationship("Track")


class TrackCluster(Base):
    __tablename__ = "track_clusters"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), unique=True, nullable=False)
    cluster_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    track = relationship("Track", back_populates="cluster")


class ClusterLabel(Base):
    __tablename__ = "cluster_labels"
    __table_args__ = (UniqueConstraint('cluster_id', 'cluster_layer', name='uq_cluster_labels_id_layer'),)

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    canonical_name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    keywords = Column(ARRAY(String), nullable=True)
    cluster_archetype = Column(String, nullable=True)
    label_version = Column(Integer, default=1, nullable=True)
    source_run_id = Column(Integer, nullable=True, default=18)
    cluster_layer = Column(String, nullable=True, default='scene')
    created_at = Column(DateTime, server_default=func.now())


class UserEra(Base):
    __tablename__ = "user_eras"
    __table_args__ = (UniqueConstraint('user_id', 'era_type', 'era_number', name='uq_user_eras_user_era_type_number'),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    era_number = Column(Integer, nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    event_count = Column(Integer, nullable=False)
    dominant_cluster_ids = Column(ARRAY(Integer), nullable=True)
    centroid_vector = Column(ARRAY(Float), nullable=True)
    era_type = Column(String, nullable=True, server_default='discovery')
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="eras")
    label = relationship("EraLabel", back_populates="era", uselist=False)


class EraLabel(Base):
    __tablename__ = "era_labels"
    __table_args__ = (UniqueConstraint('era_id', name='uq_era_labels_era_id'),)

    id = Column(Integer, primary_key=True, index=True)
    era_id = Column(Integer, ForeignKey("user_eras.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    mood = Column(String, nullable=True)
    key_tracks = Column(ARRAY(String), nullable=True)
    era_type = Column(String, nullable=True, server_default='discovery')
    created_at = Column(DateTime, server_default=func.now())
    edited_at = Column(DateTime, nullable=True)

    era = relationship("UserEra", back_populates="label")


class ClusteringRun(Base):
    __tablename__ = "clustering_runs"

    id = Column(Integer, primary_key=True)
    document_type = Column(String, nullable=False)
    umap_n_components = Column(Integer, nullable=False)
    umap_n_neighbors = Column(Integer, nullable=False)
    umap_min_dist = Column(Float, nullable=False)
    hdbscan_min_cluster_size = Column(Integer, nullable=False)
    hdbscan_min_samples = Column(Integer, nullable=True)
    num_clusters = Column(Integer, nullable=True)
    noise_ratio = Column(Float, nullable=True)
    median_cluster_size = Column(Float, nullable=True)
    largest_cluster_size = Column(Integer, nullable=True)
    silhouette_score = Column(Float, nullable=True)
    llm_coherence_score = Column(Float, nullable=True)
    cluster_layer = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    assignments = relationship("ClusteringAssignment", back_populates="run")
    coordinates = relationship("TrackClusterCoordinate", back_populates="run")


class ClusteringAssignment(Base):
    __tablename__ = "clustering_assignments"

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("clustering_runs.id"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    cluster_id = Column(Integer, nullable=False)
    probability = Column(Float, nullable=True)
    assignment_type = Column(String, nullable=True, default='hard')  # 'hard' | 'soft' | 'between_worlds'
    soft_cluster_id = Column(Integer, nullable=True)
    soft_similarity = Column(Float, nullable=True)

    run = relationship("ClusteringRun", back_populates="assignments")
    track = relationship("Track")


class TrackClusterCoordinate(Base):
    __tablename__ = "track_cluster_coordinates"

    id = Column(Integer, primary_key=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    run_id = Column(Integer, ForeignKey("clustering_runs.id"), nullable=False)
    components = Column(ARRAY(Float), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    track = relationship("Track")
    run = relationship("ClusteringRun", back_populates="coordinates")


class VibeClusterCentroid(Base):
    __tablename__ = "vibe_cluster_centroids"

    id = Column(Integer, primary_key=True)
    cluster_id = Column(Integer, unique=True, nullable=False)
    raw_centroid = Column(ARRAY(Float), nullable=False)  # 1536D mean of vibe embeddings
    track_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class ClusterCentroid(Base):
    __tablename__ = "cluster_centroids"

    id = Column(Integer, primary_key=True)
    cluster_id = Column(Integer, unique=True, nullable=False)
    raw_centroid = Column(ARRAY(Float), nullable=False)
    umap15_centroid = Column(ARRAY(Float), nullable=True)
    map2d_centroid = Column(ARRAY(Float), nullable=True)
    track_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ClusterArchetype(Base):
    __tablename__ = "cluster_archetypes"

    id = Column(Integer, primary_key=True)
    archetype_id = Column(Integer, unique=True, nullable=False)
    name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CommunityArchetypeAssignment(Base):
    __tablename__ = "community_archetype_assignments"

    cluster_id = Column(Integer, primary_key=True)
    archetype_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ClusterLabelArchive(Base):
    __tablename__ = "cluster_labels_archive"
    __table_args__ = (UniqueConstraint('cluster_id', 'cluster_layer', name='uq_cluster_labels_archive_id_layer'),)

    id = Column(Integer, primary_key=True)
    cluster_id = Column(Integer, nullable=False)
    name = Column(String, nullable=True)
    canonical_name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    keywords = Column(ARRAY(String), nullable=True)
    cluster_archetype = Column(String, nullable=True)
    label_version = Column(Integer, nullable=True)
    source_run_id = Column(Integer, nullable=True, default=18)
    cluster_layer = Column(String, nullable=True, default='scene')
    archived_at = Column(DateTime, default=datetime.utcnow)