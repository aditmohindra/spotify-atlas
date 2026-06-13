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


class TrackCluster(Base):
    __tablename__ = "track_clusters"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), unique=True, nullable=False)
    cluster_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    track = relationship("Track", back_populates="cluster")


class ClusterLabel(Base):
    __tablename__ = "cluster_labels"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, unique=True, nullable=False)
    name = Column(String, nullable=False)
    canonical_name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    keywords = Column(ARRAY(String), nullable=True)
    cluster_archetype = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class UserEra(Base):
    __tablename__ = "user_eras"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    era_id = Column(Integer, nullable=False)
    title = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    mood = Column(String, nullable=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    dominant_clusters = Column(ARRAY(Integer), nullable=True)
    key_tracks = Column(ARRAY(String), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="eras")


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